import {
  Injectable,
  Inject,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma, type Shift, type ShiftCalendarRule } from "@prisma/client";
import { DateTime } from "luxon";
import { z } from "zod";
import type {
  Principal,
  Permission,
  ActionInput,
  PlanDayInput,
} from "@panel/contracts";
import { metrics, project, isoDate, csv } from "@panel/domain";
import { Database } from "./db.js";
import { inUnit, can } from "./policy.js";
import * as input from "./input.js";
type Tx = Prisma.TransactionClient;
const duration = (r: {
  reportedDurationMinutes: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
}) =>
  r.reportedDurationMinutes ??
  (r.startedAt && r.endedAt ? (+r.endedAt - +r.startedAt) / 60000 : 0);
const day = (date: string) => new Date(date + "T00:00:00Z");
function bad(code: string): never {
  throw new BadRequestException({ code });
}
export function shiftWindow(
  date: string,
  shift: Shift & { calendarRules: ShiftCalendarRule[] },
  zone: string,
) {
  let start = shift.startMinute,
    end = shift.endMinute;
  const d = DateTime.fromISO(date, { zone });
  const rules = shift.calendarRules
    .filter((r) => r.weekday === d.weekday && isoDate(r.anchorDate) <= date)
    .sort((a, b) => +b.anchorDate - +a.anchorDate);
  if (rules.length) {
    const r = rules[0],
      weeks = Math.floor(
        d
          .startOf("week")
          .diff(
            DateTime.fromJSDate(r.anchorDate, { zone: "utc" })
              .setZone(zone, { keepLocalTime: true })
              .startOf("week"),
            "weeks",
          ).weeks,
      );
    if (!r.enabled || weeks % r.intervalWeeks !== 0) return null;
    start = r.startMinute ?? start;
    end = r.endMinute ?? end;
  }
  const from = d.startOf("day").plus({ minutes: start });
  const to = d
    .startOf("day")
    .plus({ days: end <= start ? 1 : 0, minutes: end });
  return { from, to };
}
@Injectable()
export class Operations {
  constructor(@Inject(Database) readonly db: Database) {}
  private denied(): never {
    throw new ForbiddenException({ code: "forbidden" });
  }
  permission(p: Principal, key: Permission) {
    if (!can(p, key)) this.denied();
  }
  unit(p: Principal, key: string) {
    if (!inUnit(p, key)) this.denied();
  }
  async area(p: Principal, areaId: string) {
    const a = await this.db.area.findUnique({
      where: { id: input.id.parse(areaId) },
      include: { factory: { include: { unit: true } } },
    });
    if (!a) throw new NotFoundException({ code: "not_found" });
    this.unit(p, a.factory.unit.accessKey);
    return a;
  }
  private actor(tx: Tx, p: Principal) {
    return tx.actor.upsert({
      where: { issuer_subject: { issuer: p.issuer, subject: p.subject } },
      create: { issuer: p.issuer, subject: p.subject, displayName: p.name },
      update: { displayName: p.name },
    });
  }
  private async audit(
    tx: Tx,
    p: Principal,
    unitKey: string | null,
    type: string,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
  ) {
    const a = await this.actor(tx, p);
    return tx.auditEvent.create({
      data: {
        actorId: a.id,
        unitKey,
        entityType: type,
        entityId: id,
        action,
        ...(before == null
          ? {}
          : { before: JSON.parse(JSON.stringify(before)) }),
        ...(after == null ? {} : { after: JSON.parse(JSON.stringify(after)) }),
      },
    });
  }
  private async shift(p: Principal, shiftId: string, unitId: string) {
    const shift = await this.db.shift.findUnique({
      where: { id: shiftId },
      include: { calendarRules: true, unit: true },
    });
    if (!shift || shift.unitId !== unitId) bad("invalid_relationship");
    this.unit(p, shift.unit.accessKey);
    return shift;
  }
  private writableDate(
    p: Principal,
    date: string,
    shift: Shift & {
      calendarRules: ShiftCalendarRule[];
      unit: { timeZone: string };
    },
  ) {
    if (can(p, "production.backdate")) return;
    const window = shiftWindow(date, shift, shift.unit.timeZone),
      now = DateTime.now();
    if (!window || now < window.from || now >= window.to) this.denied();
  }
  async tree(p: Principal) {
    if (!p.permissions.length) this.denied();
    const scope = p.global ? {} : { accessKey: { in: p.scopes } };
    return this.db.organization.findMany({
      where: p.global ? {} : { units: { some: scope } },
      orderBy: { code: "asc" },
      include: {
        units: {
          where: scope,
          orderBy: { code: "asc" },
          include: {
            shifts: {
              include: { calendarRules: true },
              orderBy: { code: "asc" },
            },
            reasons: {
              include: { translations: true },
              orderBy: { code: "asc" },
            },
            factories: {
              orderBy: { code: "asc" },
              include: {
                areas: {
                  orderBy: { code: "asc" },
                  include: {
                    stages: {
                      include: { translations: true },
                      orderBy: { code: "asc" },
                    },
                    lines: {
                      orderBy: { code: "asc" },
                      include: {
                        stages: true,
                        equipment: { orderBy: { code: "asc" } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
  async createResource(p: Principal, body: unknown) {
    this.permission(p, "organization.manage");
    const data = input.resourceInput.parse(body);
    // Creating or moving organization boundaries requires an explicit global claim.
    if (!p.global) this.denied();
    return this.db.$transaction(async (tx) => {
      let created: unknown;
      switch (data.kind) {
        case "organization":
          created = await tx.organization.create({
            data: { code: data.code, name: data.name },
          });
          break;
        case "unit":
          created = await tx.unit.create({
            data: {
              organizationId: data.parentId,
              code: data.code,
              name: data.name,
              accessKey: data.accessKey,
              timeZone: data.timeZone,
            },
          });
          break;
        case "factory":
          created = await tx.factory.create({
            data: { unitId: data.parentId, code: data.code, name: data.name },
          });
          break;
        case "area":
          created = await tx.area.create({
            data: {
              factoryId: data.parentId,
              code: data.code,
              name: data.name,
            },
          });
          break;
        case "line":
          created = await tx.line.create({
            data: { areaId: data.parentId, code: data.code, name: data.name },
          });
          break;
        case "stage":
          created = await tx.processStage.create({
            data: { areaId: data.parentId, code: data.code, name: data.name },
          });
          break;
        case "equipment":
          created = await tx.equipment.create({
            data: {
              lineId: data.parentId,
              code: data.code,
              name: data.name,
              workCenter: data.workCenter || null,
              assetCode: data.assetCode || null,
            },
          });
          break;
        case "reason":
          created = await tx.stopReason.create({
            data: { unitId: data.parentId, code: data.code, name: data.name },
          });
          break;
        case "lineStage": {
          const l = await tx.line.findUniqueOrThrow({
              where: { id: data.lineId },
            }),
            s = await tx.processStage.findUniqueOrThrow({
              where: { id: data.stageId },
            });
          if (l.areaId !== s.areaId) bad("invalid_relationship");
          created = await tx.lineStage.create({
            data: { lineId: l.id, stageId: s.id },
          });
          break;
        }
        case "shift":
          created = await tx.shift.create({
            data: {
              unitId: data.parentId,
              code: data.code,
              name: data.name,
              startMinute: data.startMinute,
              endMinute: data.endMinute,
            },
          });
          break;
        case "calendar": {
          const { kind, ...r } = data;
          created = await tx.shiftCalendarRule.create({
            data: { ...r, anchorDate: day(r.anchorDate) },
          });
          break;
        }
      }
      await this.audit(
        tx,
        p,
        null,
        data.kind,
        (created as { id: string }).id,
        "CREATE",
        null,
        created,
      );
      return created;
    });
  }
  async translate(p: Principal, body: unknown) {
    this.permission(p, "organization.manage");
    const d = z
      .object({
        kind: z.enum(["stage", "reason"]),
        id: input.id,
        locale: z.enum(["pt-BR", "en-US", "es-ES"]),
        label: z.string().trim().min(1).max(160),
      })
      .strict()
      .parse(body);
    let key: string;
    if (d.kind === "stage") {
      const s = await this.db.processStage.findUniqueOrThrow({
        where: { id: d.id },
      });
      key = (await this.area(p, s.areaId)).factory.unit.accessKey;
    } else {
      const r = await this.db.stopReason.findUniqueOrThrow({
        where: { id: d.id },
        include: { unit: true },
      });
      key = r.unit.accessKey;
      this.unit(p, key);
    }
    return this.db.$transaction(async (tx) => {
      const result =
        d.kind === "stage"
          ? await tx.stageTranslation.upsert({
              where: { stageId_locale: { stageId: d.id, locale: d.locale } },
              create: { stageId: d.id, locale: d.locale, label: d.label },
              update: { label: d.label },
            })
          : await tx.reasonTranslation.upsert({
              where: { reasonId_locale: { reasonId: d.id, locale: d.locale } },
              create: { reasonId: d.id, locale: d.locale, label: d.label },
              update: { label: d.label },
            });
      await this.audit(tx, p, key, "translation", d.id, "UPDATE", null, result);
      return result;
    });
  }
  async targets(p: Principal, areaId: string, date: string) {
    this.permission(p, "production.read");
    await this.area(p, areaId);
    input.date.parse(date);
    return this.db.targetSchedule.findMany({
      where: { lineStage: { line: { areaId } } },
      include: {
        versions: {
          where: { kind: "CONFIGURATION", effectiveFrom: { lte: day(date) } },
          orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
          take: 1,
        },
      },
    });
  }
  async target(p: Principal, body: unknown) {
    this.permission(p, "targets.manage");
    const d = input.targetInput.parse(body);
    const ls = await this.db.lineStage.findUniqueOrThrow({
      where: { id: d.lineStageId },
      include: { line: true },
    });
    const a = await this.area(p, ls.line.areaId);
    await this.shift(p, d.shiftId, a.factory.unitId);
    return this.db.$transaction(
      async (tx) => {
        const schedule = await tx.targetSchedule.upsert({
          where: {
            lineStageId_shiftId: {
              lineStageId: d.lineStageId,
              shiftId: d.shiftId,
            },
          },
          create: { lineStageId: d.lineStageId, shiftId: d.shiftId },
          update: {},
        });
        if (schedule.revision !== d.expectedRevision)
          throw new ConflictException({ code: "revision_conflict" });
        const changed = await tx.targetSchedule.updateMany({
          where: { id: schedule.id, revision: d.expectedRevision },
          data: { revision: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictException({ code: "revision_conflict" });
        const actor = await this.actor(tx, p);
        const version = await tx.targetVersion.create({
          data: {
            scheduleId: schedule.id,
            revision: schedule.revision + 1,
            effectiveFrom: day(d.effectiveFrom),
            enabled: d.enabled,
            capacity: d.capacity,
            efficiencyPercent: d.efficiencyPercent,
            quantityTarget: d.quantityTarget,
            actorId: actor.id,
          },
        });
        await this.audit(
          tx,
          p,
          a.factory.unit.accessKey,
          "target",
          version.id,
          "VERSION",
          schedule,
          version,
        );
        return version;
      },
      { isolationLevel: "Serializable" },
    );
  }
  private async selectedTarget(
    tx: Tx,
    lineStageId: string,
    shiftId: string,
    date: Date,
  ) {
    return tx.targetVersion.findFirst({
      where: {
        kind: "CONFIGURATION",
        schedule: { lineStageId, shiftId },
        effectiveFrom: { lte: date },
      },
      orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
    });
  }
  async production(p: Principal, body: unknown, recordId?: string) {
    const d = input.productionInput.parse(body);
    const ls = await this.db.lineStage.findUniqueOrThrow({
      where: { id: d.lineStageId },
      include: { line: true },
    });
    const a = await this.area(p, ls.line.areaId);
    const shift = await this.shift(p, d.shiftId, a.factory.unitId);
    const previous = recordId
      ? await this.db.productionEntry.findUniqueOrThrow({
          where: { id: input.id.parse(recordId) },
          include: { actor: true, lineStage: { include: { line: true } } },
        })
      : null;
    if (previous) {
      await this.area(p, previous.lineStage.line.areaId);
      if (
        previous.lineStageId !== d.lineStageId ||
        previous.shiftId !== d.shiftId ||
        isoDate(previous.operationDate) !== d.operationDate
      )
        bad("immutable_record_scope");
      if (!can(p, "production.edit.any")) {
        this.permission(p, "production.edit.own");
        if (
          previous.actor.issuer !== p.issuer ||
          previous.actor.subject !== p.subject
        )
          this.denied();
        this.writableDate(p, d.operationDate, shift);
      }
      if (d.version !== previous.version)
        throw new ConflictException({ code: "revision_conflict" });
    } else {
      this.permission(p, "production.create");
      this.writableDate(p, d.operationDate, shift);
    }
    return this.db.$transaction(
      async (tx) => {
        const actor = await this.actor(tx, p),
          target = previous
            ? null
            : await this.selectedTarget(
                tx,
                d.lineStageId,
                d.shiftId,
                day(d.operationDate),
              );
        const record = previous
          ? await tx.productionEntry.update({
              where: { id: previous.id, version: d.version },
              data: {
                quantity: d.quantity,
                defects: d.defects,
                recovery: d.recovery,
                version: { increment: 1 },
              },
            })
          : await tx.productionEntry.create({
              data: {
                operationDate: day(d.operationDate),
                lineStageId: d.lineStageId,
                shiftId: d.shiftId,
                quantity: d.quantity,
                defects: d.defects,
                recovery: d.recovery,
                actorId: actor.id,
                targetVersionId: target?.id,
              },
            });
        await this.audit(
          tx,
          p,
          a.factory.unit.accessKey,
          "production",
          record.id,
          previous ? "UPDATE" : "CREATE",
          previous,
          record,
        );
        return record;
      },
      { isolationLevel: "Serializable" },
    );
  }
  async stop(p: Principal, body: unknown, recordId?: string) {
    const d = input.stopInput.parse(body),
      equipment = await this.db.equipment.findUniqueOrThrow({
        where: { id: d.equipmentId },
        include: { line: true },
      }),
      a = await this.area(p, equipment.line.areaId),
      shift = await this.shift(p, d.shiftId, a.factory.unitId),
      reason = await this.db.stopReason.findUniqueOrThrow({
        where: { id: d.reasonId },
      });
    if (reason.unitId !== a.factory.unitId) bad("invalid_relationship");
    if (d.startedAt && d.endedAt) {
      const w = shiftWindow(d.operationDate, shift, shift.unit.timeZone);
      if (
        !w ||
        DateTime.fromISO(d.startedAt) < w.from ||
        DateTime.fromISO(d.endedAt) > w.to
      )
        bad("outside_shift");
    }
    const previous = recordId
      ? await this.db.stopEntry.findUniqueOrThrow({
          where: { id: input.id.parse(recordId) },
          include: { actor: true, equipment: { include: { line: true } } },
        })
      : null;
    if (previous) {
      await this.area(p, previous.equipment.line.areaId);
      if (
        previous.equipmentId !== d.equipmentId ||
        previous.shiftId !== d.shiftId ||
        isoDate(previous.operationDate) !== d.operationDate
      )
        bad("immutable_record_scope");
      if (!can(p, "stops.edit.any")) {
        this.permission(p, "stops.edit.own");
        if (
          previous.actor.issuer !== p.issuer ||
          previous.actor.subject !== p.subject
        )
          this.denied();
        this.writableDate(p, d.operationDate, shift);
      }
      if (d.version !== previous.version)
        throw new ConflictException({ code: "revision_conflict" });
    } else {
      this.permission(p, "stops.create");
      this.writableDate(p, d.operationDate, shift);
    }
    return this.db.$transaction(
      async (tx) => {
        const actor = await this.actor(tx, p),
          data = {
            reasonId: d.reasonId,
            comment: d.comment,
            reportedDurationMinutes: d.startedAt ? null : d.durationMinutes,
            startedAt: d.startedAt ? new Date(d.startedAt) : null,
            endedAt: d.endedAt ? new Date(d.endedAt) : null,
          };
        const record = previous
          ? await tx.stopEntry.update({
              where: { id: previous.id, version: d.version },
              data: { ...data, version: { increment: 1 } },
            })
          : await tx.stopEntry.create({
              data: {
                ...data,
                equipmentId: d.equipmentId,
                shiftId: d.shiftId,
                operationDate: day(d.operationDate),
                actorId: actor.id,
              },
            });
        await this.audit(
          tx,
          p,
          a.factory.unit.accessKey,
          "stop",
          record.id,
          previous ? "UPDATE" : "CREATE",
          previous,
          record,
        );
        return { ...record, durationMinutes: duration(record) };
      },
      { isolationLevel: "Serializable" },
    );
  }
  private async filter(p: Principal, query: unknown) {
    const q = input.pagination.parse(query);
    const a = await this.area(p, q.areaId);
    if (q.lineId) {
      const l = await this.db.line.findUniqueOrThrow({
        where: { id: q.lineId },
      });
      if (l.areaId !== a.id) bad("invalid_relationship");
    }
    if (q.stageId) {
      const s = await this.db.processStage.findUniqueOrThrow({
        where: { id: q.stageId },
      });
      if (s.areaId !== a.id) bad("invalid_relationship");
    }
    if (q.shiftId) await this.shift(p, q.shiftId, a.factory.unitId);
    return { q, a };
  }
  private whereProduction(
    q: z.infer<typeof input.pagination>,
  ): Prisma.ProductionEntryWhereInput {
    return {
      operationDate: { gte: day(q.from), lte: day(q.to) },
      lineStage: {
        line: { areaId: q.areaId, ...(q.lineId ? { id: q.lineId } : {}) },
        ...(q.stageId ? { stageId: q.stageId } : {}),
      },
      ...(q.shiftId ? { shiftId: q.shiftId } : {}),
    };
  }
  async history(p: Principal, query: unknown, stops = false) {
    this.permission(p, stops ? "stops.read" : "production.read");
    const { q } = await this.filter(p, query);
    const where = stops
      ? {
          operationDate: { gte: day(q.from), lte: day(q.to) },
          equipment: {
            line: { areaId: q.areaId, ...(q.lineId ? { id: q.lineId } : {}) },
          },
          ...(q.shiftId ? { shiftId: q.shiftId } : {}),
        }
      : this.whereProduction(q);
    if (stops) {
      const where: Prisma.StopEntryWhereInput = {
        operationDate: { gte: day(q.from), lte: day(q.to) },
        equipment: {
          line: { areaId: q.areaId, ...(q.lineId ? { id: q.lineId } : {}) },
        },
        ...(q.shiftId ? { shiftId: q.shiftId } : {}),
      };
      const [items, total] = await this.db.$transaction([
        this.db.stopEntry.findMany({
          where,
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          orderBy: [
            { operationDate: "desc" },
            { createdAt: "desc" },
            { id: "asc" },
          ],
          include: {
            equipment: { include: { line: true } },
            reason: true,
            shift: true,
            actor: { select: { displayName: true } },
          },
        }),
        this.db.stopEntry.count({ where }),
      ]);
      return {
        items: items.map((r) => ({ ...r, durationMinutes: duration(r) })),
        total,
        page: q.page,
        pageSize: q.pageSize,
      };
    }
    const productionWhere = this.whereProduction(q);
    const [items, total] = await this.db.$transaction([
      this.db.productionEntry.findMany({
        where: productionWhere,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: [
          { operationDate: "desc" },
          { createdAt: "desc" },
          { id: "asc" },
        ],
        include: {
          lineStage: { include: { line: true, stage: true } },
          shift: true,
          targetVersion: true,
          actor: { select: { displayName: true } },
        },
      }),
      this.db.productionEntry.count({ where: productionWhere }),
    ]);
    return {
      items: items.map((r) => ({
        ...r,
        metrics: metrics(
          r.quantity,
          r.defects,
          r.targetVersion?.capacity ?? null,
          r.targetVersion?.efficiencyPercent?.toNumber() ?? null,
          r.targetVersion?.quantityTarget ?? null,
        ),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  async summary(p: Principal, query: unknown) {
    this.permission(p, "production.read");
    const { q } = await this.filter(p, query);
    const groups = await this.db.productionEntry.groupBy({
      by: ["operationDate", "lineStageId", "shiftId", "targetVersionId"],
      where: this.whereProduction(q),
      _sum: { quantity: true, defects: true },
      _count: { _all: true },
      take: 50001,
      orderBy: [
        { operationDate: "asc" },
        { lineStageId: "asc" },
        { shiftId: "asc" },
        { targetVersionId: "asc" },
      ],
    });
    if (groups.length > 50000) bad("reduce_interval");
    const [lineStages, shifts, targets] = await Promise.all([
      this.db.lineStage.findMany({
        where: { id: { in: [...new Set(groups.map((g) => g.lineStageId))] } },
        include: { line: true, stage: true },
      }),
      this.db.shift.findMany({
        where: { id: { in: [...new Set(groups.map((g) => g.shiftId))] } },
      }),
      this.db.targetVersion.findMany({
        where: {
          id: {
            in: [
              ...new Set(
                groups.flatMap((g) =>
                  g.targetVersionId ? [g.targetVersionId] : [],
                ),
              ),
            ],
          },
        },
      }),
    ]);
    const lsMap = new Map(lineStages.map((l) => [l.id, l])),
      shiftMap = new Map(shifts.map((s) => [s.id, s])),
      targetMap = new Map(targets.map((t) => [t.id, t]));
    const combined = new Map<
      string,
      {
        date: string;
        lineStageId: string;
        line: string;
        stage: string;
        shift: string;
        shiftId: string;
        quantity: number;
        defects: number;
        capacity: number | null;
        rate: number | null;
        target: number | null;
        revisions: Set<string>;
        variants: Set<string>;
      }
    >();
    for (const r of groups) {
      const date = isoDate(r.operationDate),
        key = [date, r.lineStageId, r.shiftId].join("|"),
        t = r.targetVersionId ? targetMap.get(r.targetVersionId) : null,
        ls = lsMap.get(r.lineStageId)!;
      let g = combined.get(key);
      if (!g) {
        g = {
          date,
          lineStageId: r.lineStageId,
          line: ls.line.name,
          stage: ls.stage.name,
          shift: shiftMap.get(r.shiftId)!.name,
          shiftId: r.shiftId,
          quantity: 0,
          defects: 0,
          capacity: t?.capacity ?? null,
          rate: t?.efficiencyPercent?.toNumber() ?? null,
          target: t?.quantityTarget ?? null,
          revisions: new Set(),
          variants: new Set(),
        };
        combined.set(key, g);
      }
      g.quantity += r._sum.quantity || 0;
      g.defects += r._sum.defects || 0;
      if (t) g.revisions.add(t.id);
      g.variants.add(
        JSON.stringify([
          t?.capacity ?? null,
          t?.efficiencyPercent?.toNumber() ?? null,
          t?.quantityTarget ?? null,
          t?.enabled ?? null,
        ]),
      );
    }
    const rows = [...combined.values()]
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.line.localeCompare(b.line) ||
          a.shift.localeCompare(b.shift),
      )
      .map(({ variants, ...g }) => {
        const mixed = variants.size > 1;
        return {
          ...g,
          capacity: mixed ? null : g.capacity,
          rate: mixed ? null : g.rate,
          target: mixed ? null : g.target,
          revisions: [...g.revisions],
          metrics: metrics(
            g.quantity,
            g.defects,
            mixed ? null : g.capacity,
            mixed ? null : g.rate,
            mixed ? null : g.target,
          ),
          mixedTargets: mixed,
        };
      });
    return {
      rows,
      quantity: groups.reduce((n, r) => n + (r._sum.quantity || 0), 0),
      defects: groups.reduce((n, r) => n + (r._sum.defects || 0), 0),
      count: groups.reduce((n, r) => n + r._count._all, 0),
    };
  }

  async export(p: Principal, query: unknown) {
    this.permission(p, "reports.export");
    const s = await this.summary(p, query);
    return csv([
      [
        "date",
        "line",
        "stage",
        "shift",
        "quantity",
        "defects",
        "capacity",
        "efficiency_percent",
        "target",
        "ppm",
        "mixed_targets",
      ],
      ...s.rows.map((r) => [
        r.date,
        r.line,
        r.stage,
        r.shift,
        r.quantity,
        r.defects,
        r.capacity,
        r.metrics.efficiency,
        r.metrics.target,
        r.metrics.ppm,
        r.mixedTargets,
      ]),
    ]);
  }
  async plans(p: Principal, areaId: string) {
    this.permission(p, "plans.read");
    await this.area(p, areaId);
    const plans = await this.db.recoveryPlan.findMany({
      where: { areaId },
      include: {
        versions: {
          orderBy: { revision: "desc" },
          take: 1,
          include: {
            days: { orderBy: { date: "asc" } },
            actions: true,
            costs: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });
    return plans;
  }
  async plan(p: Principal, areaId: string, body: unknown, planId?: string) {
    this.permission(p, "plans.manage");
    const a = await this.area(p, areaId),
      d = input.planInput.parse(body),
      stage = await this.db.processStage.findUniqueOrThrow({
        where: { id: d.stageId },
      });
    if (stage.areaId !== areaId) bad("invalid_relationship");
    for (const lineId of [d.lineId, ...d.actions.map((a) => a.lineId)].filter(
      (x): x is string => !!x,
    )) {
      const l = await this.db.line.findUniqueOrThrow({ where: { id: lineId } });
      if (l.areaId !== areaId) bad("invalid_relationship");
    }
    return this.db.$transaction(
      async (tx) => {
        const plan = planId
          ? await tx.recoveryPlan.findUniqueOrThrow({
              where: { id: input.id.parse(planId) },
            })
          : await tx.recoveryPlan.create({ data: { areaId } });
        if (plan.areaId !== areaId) bad("invalid_relationship");
        if (plan.currentRevision !== d.expectedRevision)
          throw new ConflictException({ code: "revision_conflict" });
        const updated = await tx.recoveryPlan.updateMany({
          where: { id: plan.id, currentRevision: d.expectedRevision },
          data: { currentRevision: { increment: 1 } },
        });
        if (!updated.count)
          throw new ConflictException({ code: "revision_conflict" });
        const actor = await this.actor(tx, p);
        const v = await tx.recoveryPlanVersion.create({
          data: {
            planId: plan.id,
            revision: plan.currentRevision + 1,
            name: d.name,
            stageId: d.stageId,
            lineId: d.lineId || null,
            startDate: day(d.startDate),
            initialBacklog: d.initialBacklog,
            quantityMode: d.quantityMode,
            archived: d.archived,
            note: d.note,
            actorId: actor.id,
            days: { create: d.days.map((r) => ({ ...r, date: day(r.date) })) },
            actions: {
              create: d.actions.map((r) => ({
                ...r,
                startDate: day(r.startDate),
                endDate: day(r.endDate),
              })),
            },
            costs: { create: d.costs },
          },
          include: { days: true, actions: true, costs: true },
        });
        await this.audit(
          tx,
          p,
          a.factory.unit.accessKey,
          "plan",
          plan.id,
          "VERSION",
          null,
          v,
        );
        return { id: plan.id, currentRevision: v.revision, versions: [v] };
      },
      { isolationLevel: "Serializable", timeout: 15000 },
    );
  }
  async projection(p: Principal, planId: string, revision?: number) {
    this.permission(p, "plans.read");
    const plan = await this.db.recoveryPlan.findUniqueOrThrow({
      where: { id: input.id.parse(planId) },
      include: {
        versions: {
          where: revision ? { revision } : {},
          orderBy: { revision: "desc" },
          take: 1,
          include: {
            days: { orderBy: { date: "asc" } },
            actions: true,
            costs: true,
          },
        },
      },
    });
    const a = await this.area(p, plan.areaId),
      v = plan.versions[0];
    if (!v) bad("not_found");
    const rows = await this.db.productionEntry.groupBy({
      by: ["operationDate", "recovery"],
      where: {
        lineStage: {
          stageId: v.stageId,
          line: { areaId: plan.areaId, ...(v.lineId ? { id: v.lineId } : {}) },
        },
        operationDate: { gte: v.startDate, lte: v.days.at(-1)?.date },
      },
      _sum: { quantity: true, defects: true },
    });
    const actuals: Record<
      string,
      {
        quantity: number;
        defects: number;
        recovery: number;
        recoveryDefects: number;
      }
    > = {};
    for (const r of rows) {
      const d = isoDate(r.operationDate),
        o = actuals[d] || {
          quantity: 0,
          defects: 0,
          recovery: 0,
          recoveryDefects: 0,
        };
      o.quantity += r._sum.quantity || 0;
      o.defects += r._sum.defects || 0;
      if (r.recovery) {
        o.recovery += r._sum.quantity || 0;
        o.recoveryDefects += r._sum.defects || 0;
      }
      actuals[d] = o;
    }
    return {
      planId: plan.id,
      revision: v.revision,
      ...project(
        v.initialBacklog,
        v.days.map((r) => ({ ...r, date: isoDate(r.date) })) as PlanDayInput[],
        v.actions.map((r) => ({
          ...r,
          startDate: isoDate(r.startDate),
          endDate: isoDate(r.endDate),
          costPerDay: r.costPerDay.toNumber(),
        })) as ActionInput[],
        DateTime.now().setZone(a.factory.unit.timeZone).toISODate()!,
        actuals,
        v.quantityMode === "GOOD",
      ),
    };
  }
  async revisions(p: Principal, planId: string) {
    this.permission(p, "plans.read");
    const plan = await this.db.recoveryPlan.findUniqueOrThrow({
      where: { id: input.id.parse(planId) },
    });
    await this.area(p, plan.areaId);
    return this.db.recoveryPlanVersion.findMany({
      where: { planId },
      select: {
        revision: true,
        createdAt: true,
        name: true,
        actor: { select: { displayName: true } },
      },
      orderBy: { revision: "desc" },
    });
  }
  async audits(p: Principal, unitId: string, page = 1) {
    this.permission(p, "audit.read");
    const u = await this.db.unit.findUniqueOrThrow({
      where: { id: input.id.parse(unitId) },
    });
    this.unit(p, u.accessKey);
    page = z.coerce.number().int().min(1).max(100000).parse(page);
    return this.db.auditEvent.findMany({
      where: p.global
        ? { OR: [{ unitKey: u.accessKey }, { unitKey: null }] }
        : { unitKey: u.accessKey },
      skip: (page - 1) * 50,
      take: 50,
      orderBy: { occurredAt: "desc" },
      include: { actor: { select: { displayName: true } } },
    });
  }
  async recipients(p: Principal, unitId: string) {
    this.permission(p, "reports.email");
    const u = await this.db.unit.findUniqueOrThrow({
      where: { id: input.id.parse(unitId) },
    });
    this.unit(p, u.accessKey);
    return this.db.reportRecipient.findMany({
      where: { unitId },
      orderBy: { address: "asc" },
    });
  }
  async recipient(p: Principal, body: unknown) {
    this.permission(p, "reports.email");
    const d = input.recipientInput.parse(body);
    const u = await this.db.unit.findUniqueOrThrow({ where: { id: d.unitId } });
    this.unit(p, u.accessKey);
    const allowed = (process.env.MAIL_ALLOWED_DOMAINS || "")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim());
    if (!allowed.includes(d.address.split("@")[1].toLowerCase()))
      bad("email_domain_not_allowed");
    d.address = d.address.toLowerCase();
    return this.db.$transaction(async (tx) => {
      const r = await tx.reportRecipient.upsert({
        where: { unitId_address: { unitId: d.unitId, address: d.address } },
        create: d,
        update: { locale: d.locale, enabled: d.enabled },
      });
      await this.audit(
        tx,
        p,
        u.accessKey,
        "recipient",
        r.id,
        "UPDATE",
        null,
        r,
      );
      return r;
    });
  }
  async report(p: Principal, query: unknown) {
    this.permission(p, "reports.email");
    if (process.env.MAIL_ENABLED !== "true") bad("mail_disabled");
    const { a, q } = await this.filter(p, query),
      s = await this.summary(p, query);
    const recipients = await this.db.reportRecipient.findMany({
      where: { unitId: a.factory.unitId, enabled: true },
      take: 100,
    });
    if (!recipients.length) bad("no_recipients");
    const labels: Record<string, string[]> = {
      "pt-BR": ["Relatório de produção", "Produção", "Defeitos"],
      "en-US": ["Production report", "Production", "Defects"],
      "es-ES": ["Informe de producción", "Producción", "Defectos"],
    };
    return this.db.$transaction(async (tx) => {
      const count = await tx.mailOutbox.createMany({
        data: recipients.map((r) => {
          const l = labels[r.locale] || labels["pt-BR"];
          return {
            recipientId: r.id,
            subject: `${l[0]} · ${a.name} · ${q.from} / ${q.to}`,
            text: `${l[1]}: ${s.quantity}\n${l[2]}: ${s.defects}\n`,
          };
        }),
      });
      await this.audit(
        tx,
        p,
        a.factory.unit.accessKey,
        "mail",
        a.id,
        "QUEUE_REPORT",
        null,
        { count: count.count, from: q.from, to: q.to },
      );
      return { queued: count.count };
    });
  }
}
