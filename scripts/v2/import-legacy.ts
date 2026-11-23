/** Offline migration only. Never reads passwords or creates access grants. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { z } from "zod";
import {
  productionInput,
  stopInput,
  planInput,
  targetInput,
  id,
  date,
} from "../../apps/api/src/input.js";
const section = z
  .object({
    areaId: id,
    timeZone: z.string(),
    shifts: z.record(z.string(), id),
    lines: z.record(z.string(), id),
    stages: z.record(z.string(), id),
    equipment: z.record(z.string(), id),
    reasons: z.record(z.string(), id),
  })
  .strict();
const mappingSchema = z
  .object({
    source: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
    sections: z.record(z.string(), section),
    baselineTargets: z.array(targetInput).default([]),
  })
  .strict();
type Mapping = z.infer<typeof mappingSchema>;
type Row = Record<string, unknown>;
const object = (value: unknown): Row => {
  if (typeof value === "string") value = JSON.parse(value);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("invalid_legacy_object");
  return value as Row;
};
const rows = (backup: Row, key: string): Row[] => {
  const value = backup[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw Error("invalid_legacy_table:" + key);
  return value.map(object);
};
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const day = (d: string) => new Date(d + "T00:00:00Z");
const at = (v: unknown, fallback: string) => {
  const d = DateTime.fromISO(String(v || fallback));
  if (!d.isValid) throw Error("invalid_legacy_timestamp");
  return d.toJSDate();
};
const match = (values: Record<string, string>, key: unknown, type: string) => {
  const v = values[String(key ?? "")];
  if (!v) throw Error("missing_mapping:" + type + ":" + String(key));
  return v;
};
export async function importLegacy(
  db: PrismaClient,
  backupValue: unknown,
  mappingValue: unknown,
  apply = false,
) {
  const backup = object(backupValue);
  for (const key of [
    "users",
    "records",
    "projection_plans",
    "projection_revisions",
    "goal_changes",
    "performance_changes",
    "audit",
  ])
    if (!Array.isArray(backup[key])) throw Error("incomplete_backup:" + key);
  const mapping = mappingSchema.parse(mappingValue),
    users = new Map(
      rows(backup, "users").map((u) => [
        String(u.id),
        String(u.name || u.username || u.id).slice(0, 160),
      ]),
    );
  const records = rows(backup, "records"),
    plans = rows(backup, "projection_plans"),
    revisions = rows(backup, "projection_revisions"),
    goals = rows(backup, "goal_changes"),
    performances = rows(backup, "performance_changes");
  const prepared: {
    sourceId: string;
    kind: "production" | "stop";
    areaId: string;
    actor: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    data:
      | ReturnType<typeof productionInput.parse>
      | ReturnType<typeof stopInput.parse>;
    capacity: number | null;
    rate: number | null;
    quantityTarget: number | null;
  }[] = [];
  const lineStages = await db.lineStage.findMany({ include: { line: true } }),
    lookup = new Map(
      lineStages.map((ls) => [ls.lineId + "|" + ls.stageId, ls]),
    );
  for (const record of records) {
    const m = mapping.sections[String(record.section)];
    if (!m) throw Error("missing_section_mapping");
    const d = object(record.data),
      lineId = match(m.lines, d.linha, "line"),
      ls = lookup.get(
        lineId +
          "|" +
          match(m.stages, d.etapa || Object.keys(m.stages)[0], "stage"),
      );
    if (record.kind === "producao" && (!ls || ls.line.areaId !== m.areaId))
      throw Error("invalid_line_stage_mapping");
    const base = {
      operationDate: date.parse(d.data),
      shiftId: match(m.shifts, d.turno || "3", "shift"),
    };
    let data: (typeof prepared)[number]["data"];
    if (record.kind === "producao")
      data = productionInput.parse({
        ...base,
        lineStageId: ls!.id,
        quantity: Number(d.producao),
        defects: Number(d.defeitos || 0),
        recovery: d.recuperacao_atraso === true,
      });
    else if (record.kind === "perturbacao") {
      const convert = (v: unknown) => {
        if (!v) return null;
        const parsed = DateTime.fromISO(String(v), { zone: m.timeZone });
        if (!parsed.isValid) throw Error("invalid_legacy_stop_time");
        return parsed.toISO();
      };
      data = stopInput.parse({
        ...base,
        equipmentId: match(
          m.equipment,
          d.equipamentoId ||
            d.equipamento_id ||
            d.equipment_id ||
            d.codigo ||
            d.descricao,
          "equipment",
        ),
        reasonId: match(m.reasons, d.motivo, "reason"),
        comment: String(d.comentario || ""),
        durationMinutes: Number(d.duracao),
        startedAt: convert(d.inicio),
        endedAt: convert(d.fim),
      });
    } else throw Error("unknown_legacy_record_kind");
    const createdAt = at(record.created, String(d.data) + "T12:00:00Z"),
      updatedAt = at(record.updated, createdAt.toISOString());
    prepared.push({
      sourceId: String(record.id),
      kind: record.kind === "producao" ? "production" : "stop",
      areaId: m.areaId,
      actor: String(record.owner),
      name: users.get(String(record.owner)) || "Legacy " + String(record.owner),
      createdAt,
      updatedAt,
      data,
      capacity: d.capacity == null ? null : Number(d.capacity),
      rate: d.efficiency_target == null ? null : Number(d.efficiency_target),
      quantityTarget:
        d.capacity != null ? null : d.meta == null ? null : Number(d.meta),
    });
  }
  const preparedPlans: {
    sourceId: string;
    areaId: string;
    revision: number;
    actor: string;
    createdAt: Date;
    data: ReturnType<typeof planInput.parse>;
  }[] = [];
  const versions = new Map<string, Row>();
  for (const p of plans)
    versions.set(String(p.id) + "|" + String(p.revision), p);
  for (const r of revisions) {
    const snapshot = object(r.snapshot);
    versions.set(String(r.plan_id) + "|" + String(r.revision), {
      ...snapshot,
      id: r.plan_id,
      section: r.section,
      revision: r.revision,
      actor: r.actor,
      created: r.at,
    });
  }
  for (const p of versions.values()) {
    const m = mapping.sections[String(p.section)];
    if (!m) throw Error("missing_section_mapping");
    const d = object(p.data),
      rs = d.rows;
    if (!Array.isArray(rs)) throw Error("missing_plan_days");
    const actions = Array.isArray(d.actions) ? d.actions.map(object) : [];
    const kind: Record<string, string> = {
        HE: "OVERTIME",
        Capacidade: "CAPACITY",
        Material: "MATERIAL",
        Pessoas: "PEOPLE",
        Manutenção: "MAINTENANCE",
        Outro: "OTHER",
      },
      status: Record<string, string> = {
        Planejada: "PLANNED",
        "Em andamento": "IN_PROGRESS",
        Concluída: "COMPLETED",
        Cancelada: "CANCELLED",
      },
      calendar: Record<string, string> = {
        todos: "ALL",
        uteis: "WEEKDAYS",
        sabados: "SATURDAY",
      };
    const c = object(d.costs || {});
    const data = planInput.parse({
      name: p.name,
      stageId: match(m.stages, p.stage, "stage"),
      lineId: d.line ? match(m.lines, d.line, "line") : null,
      startDate: p.start_date,
      initialBacklog: Number(p.initial_backlog),
      quantityMode: d.quantity_mode === "good" ? "GOOD" : "TOTAL",
      archived: d.archived === true,
      note: "",
      expectedRevision: 0,
      days: rs.map(object).map((r) => ({
        date: r.date,
        demand: r.demand ?? null,
        forecast: r.forecast ?? null,
        actualOverride: r.actual ?? null,
        actualReason:
          r.actual != null ? String(r.actual_reason || "Legacy import") : "",
        adjustment: r.adjustment || 0,
        adjustmentReason: r.adjustment_note || "",
        note: r.note || "",
        closed: r.closed === true,
        recoveryOnly: r.recovery_day === true,
      })),
      actions: actions.map((a) => ({
        lineId: a.line ? match(m.lines, a.line, "line") : null,
        title: a.title,
        kind: kind[String(a.kind)] || "OTHER",
        status:
          a.include === false
            ? "CANCELLED"
            : status[String(a.status)] || "PLANNED",
        calendar: calendar[String(a.schedule)] || "ALL",
        startDate: a.start,
        endDate: a.end || a.start,
        responsible: a.responsible || "",
        extraUnits: a.extra_units || 0,
        costPerDay: a.daily_cost || 0,
        note: a.note || "",
      })),
      costs: {
        hourly: Number(c.hourly || 0),
        premium: Number(c.premium ?? 2),
        charges: Number(c.charges ?? 1.7445),
        dsm: Number(c.dsm ?? 1.2),
        hours: Number(c.hours ?? 8.8),
        food: Number(c.food || 0),
        people: Number(c.people || 0),
        volume: Number(c.volume || 0),
        dailyExtra: Number(c.daily_extra || 0),
      },
    });
    preparedPlans.push({
      sourceId: String(p.id),
      areaId: m.areaId,
      revision: z.number().int().positive().parse(Number(p.revision)),
      actor: String(p.actor || "migration"),
      createdAt: at(p.created, String(p.start_date) + "T12:00:00Z"),
      data,
    });
  }
  // Validate all resource boundaries during dry run, before any mutation.
  for (const [key, m] of Object.entries(mapping.sections)) {
    const area = await db.area.findUniqueOrThrow({
      where: { id: m.areaId },
      include: { factory: { include: { unit: true } } },
    });
    if (area.factory.unit.timeZone !== m.timeZone)
      throw Error("time_zone_mapping_mismatch:" + key);
    const shifts = await db.shift.count({
      where: {
        id: { in: Object.values(m.shifts) },
        unitId: area.factory.unitId,
      },
    });
    if (shifts !== new Set(Object.values(m.shifts)).size)
      throw Error("shift_mapping_scope");
    const lineCount = await db.line.count({
      where: { id: { in: Object.values(m.lines) }, areaId: m.areaId },
    });
    if (lineCount !== new Set(Object.values(m.lines)).size)
      throw Error("line_mapping_scope");
    const stageCount = await db.processStage.count({
      where: { id: { in: Object.values(m.stages) }, areaId: m.areaId },
    });
    if (stageCount !== new Set(Object.values(m.stages)).size)
      throw Error("stage_mapping_scope");
    const equipmentCount = await db.equipment.count({
      where: {
        id: { in: Object.values(m.equipment) },
        line: { areaId: m.areaId },
      },
    });
    if (equipmentCount !== new Set(Object.values(m.equipment)).size)
      throw Error("equipment_mapping_scope");
    const reasonCount = await db.stopReason.count({
      where: {
        id: { in: Object.values(m.reasons) },
        unitId: area.factory.unitId,
      },
    });
    if (reasonCount !== new Set(Object.values(m.reasons)).size)
      throw Error("reason_mapping_scope");
  }

  const preparedTargets: {
    sourceId: string;
    actor: string;
    createdAt: Date;
    data: ReturnType<typeof targetInput.parse>;
  }[] = mapping.baselineTargets.map((data, i) => ({
    sourceId: "baseline:" + i,
    actor: "migration",
    createdAt: day(data.effectiveFrom),
    data,
  }));
  const events = [
    ...goals.map((g): Row => ({ ...g, event: "goal" })),
    ...performances.map((g): Row => ({ ...g, event: "performance" })),
  ].sort(
    (a, b) =>
      String(a.effective_date).localeCompare(String(b.effective_date)) ||
      String(a.at).localeCompare(String(b.at)) ||
      String(a.id).localeCompare(String(b.id)),
  );
  const state = new Map<
    string,
    {
      capacity: number | null;
      efficiencyPercent: number | null;
      quantityTarget: number | null;
      enabled: boolean;
    }
  >();
  for (const event of events) {
    const m = mapping.sections[String(event.section)];
    if (!m) throw Error("missing_section_mapping");
    const ls = lookup.get(
      match(m.lines, event.line, "line") +
        "|" +
        match(m.stages, event.stage, "stage"),
    );
    if (!ls) throw Error("invalid_target_mapping");
    const shifts =
      event.event === "goal" ? ["1", "2", "3"] : [String(event.turno)];
    for (const shiftCode of shifts) {
      const shiftId = match(m.shifts, shiftCode, "shift"),
        key = ls.id + "|" + shiftId,
        previous = state.get(key) || {
          capacity: null,
          efficiencyPercent: null,
          quantityTarget: null,
          enabled: false,
        };
      let next =
        event.event === "goal"
          ? {
              ...previous,
              quantityTarget:
                event["meta" + shiftCode] == null
                  ? null
                  : Number(event["meta" + shiftCode]),
              enabled: shiftCode !== "3" || Number(event.third_enabled) === 1,
            }
          : {
              ...previous,
              capacity: event.capacity == null ? null : Number(event.capacity),
              efficiencyPercent:
                event.efficiency_target == null
                  ? null
                  : Number(event.efficiency_target),
              enabled: true,
            };
      if (next.capacity != null) next.quantityTarget = null;
      if (next.capacity == null && next.quantityTarget == null)
        next.enabled = false;
      state.set(key, next);
      const data = targetInput.parse({
        lineStageId: ls.id,
        shiftId,
        effectiveFrom: event.effective_date,
        ...next,
        expectedRevision: 0,
      });
      preparedTargets.push({
        sourceId: event.event + ":" + event.id + ":" + shiftCode,
        actor: String(event.actor || "migration"),
        createdAt: at(event.at, data.effectiveFrom + "T12:00:00Z"),
        data,
      });
    }
  }
  const allowed = new Set([
    "data",
    "linha",
    "etapa",
    "turno",
    "producao",
    "defeitos",
    "capacity",
    "efficiency_target",
    "meta",
    "recuperacao_atraso",
    "equipamentoId",
    "ct",
    "descricao",
    "codigo",
    "patrimonio",
    "motivo",
    "comentario",
    "inicio",
    "fim",
    "duracao",
  ]);
  function snapshot(v: unknown) {
    if (v == null) return undefined;
    const raw = object(v),
      d = typeof raw.data === "string" ? object(raw.data) : raw;
    return Object.fromEntries(
      Object.entries(d).filter(
        ([k, v]) =>
          allowed.has(k) && ["string", "number", "boolean"].includes(typeof v),
      ),
    ) as Prisma.InputJsonObject;
  }
  const preparedAudit = rows(backup, "audit").map((a) => {
    const m = mapping.sections[String(a.section)];
    if (!m) throw Error("missing_audit_scope");
    return {
      sourceId: String(a.id),
      areaId: m.areaId,
      actor: String(a.actor || "migration"),
      occurredAt: at(a.at, "1970-01-01T00:00:00Z"),
      action: String(a.action || "LEGACY").slice(0, 60),
      recordId: String(a.record_id || a.id),
      before: snapshot(a.before_data),
      after: snapshot(a.after_data),
    };
  });
  for (const r of preparedTargets) {
    const ls = lineStages.find((ls) => ls.id === r.data.lineStageId);
    if (!ls) throw Error("target_line_stage_missing");
    const area = await db.area.findUniqueOrThrow({
      where: { id: ls.line.areaId },
      include: { factory: true },
    });
    const shift = await db.shift.findUniqueOrThrow({
      where: { id: r.data.shiftId },
    });
    if (area.factory.unitId !== shift.unitId)
      throw Error("target_unit_mismatch");
  }
  const counts = {
    productions: prepared.filter((r) => r.kind === "production").length,
    stops: prepared.filter((r) => r.kind === "stop").length,
    planVersions: preparedPlans.length,
    targetVersions: preparedTargets.length,
    auditEvents: preparedAudit.length,
  };
  if (!apply) return { dryRun: true, counts };
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(17301004)`;
      async function legacyActor(subject: string, name: string) {
        return tx.actor.upsert({
          where: {
            issuer_subject: { issuer: "urn:legacy:" + mapping.source, subject },
          },
          create: {
            issuer: "urn:legacy:" + mapping.source,
            subject,
            displayName: name,
          },
          update: {},
        });
      }
      async function existing(
        type: string,
        sourceId: string,
        checksum: string,
      ) {
        const r = await tx.legacyReference.findUnique({
          where: {
            source_entityType_sourceId: {
              source: mapping.source,
              entityType: type,
              sourceId,
            },
          },
        });
        if (r && r.checksum !== checksum)
          throw Error("legacy_source_changed:" + type + ":" + sourceId);
        return r?.targetId;
      }
      async function link(
        type: string,
        sourceId: string,
        targetId: string,
        checksum: string,
      ) {
        await tx.legacyReference.create({
          data: {
            source: mapping.source,
            entityType: type,
            sourceId,
            targetId,
            checksum,
          },
        });
      }
      for (const r of prepared.sort(
        (a, b) =>
          a.data.operationDate.localeCompare(b.data.operationDate) ||
          a.sourceId.localeCompare(b.sourceId),
      )) {
        const checksum = hash(r);
        if (await existing(r.kind, r.sourceId, checksum)) continue;
        const actor = await legacyActor(r.actor, r.name),
          { version, ...raw } = r.data;
        if (r.kind === "production") {
          const d = productionInput.parse(raw),
            schedule = await tx.targetSchedule.upsert({
              where: {
                lineStageId_shiftId: {
                  lineStageId: d.lineStageId,
                  shiftId: d.shiftId,
                },
              },
              create: { lineStageId: d.lineStageId, shiftId: d.shiftId },
              update: { revision: { increment: 1 } },
            });
          const revision = schedule.revision + 1;
          await tx.targetSchedule.update({
            where: { id: schedule.id },
            data: { revision },
          });
          const target = await tx.targetVersion.create({
            data: {
              scheduleId: schedule.id,
              revision,
              kind: "SNAPSHOT",
              effectiveFrom: day(d.operationDate),
              capacity: r.capacity,
              efficiencyPercent: r.rate,
              quantityTarget: r.quantityTarget,
              enabled: r.capacity != null || r.quantityTarget != null,
              actorId: actor.id,
              createdAt: r.createdAt,
            },
          });
          const record = await tx.productionEntry.create({
            data: {
              ...d,
              operationDate: day(d.operationDate),
              actorId: actor.id,
              targetVersionId: target.id,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt,
            },
          });
          await link(r.kind, r.sourceId, record.id, checksum);
        } else {
          const d = stopInput.parse(raw),
            { durationMinutes, version, ...stopData } = d,
            record = await tx.stopEntry.create({
              data: {
                ...stopData,
                reportedDurationMinutes: d.startedAt ? null : d.durationMinutes,
                operationDate: day(d.operationDate),
                startedAt: d.startedAt ? new Date(d.startedAt) : null,
                endedAt: d.endedAt ? new Date(d.endedAt) : null,
                actorId: actor.id,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
              },
            });
          await link(r.kind, r.sourceId, record.id, checksum);
        }
      }
      for (const r of preparedPlans.sort((a, b) => a.revision - b.revision)) {
        const checksum = hash(r),
          versionKey = r.sourceId + "|" + r.revision;
        if (await existing("plan-version", versionKey, checksum)) continue;
        let parent = await tx.legacyReference.findUnique({
          where: {
            source_entityType_sourceId: {
              source: mapping.source,
              entityType: "plan",
              sourceId: r.sourceId,
            },
          },
        });
        if (!parent) {
          const p = await tx.recoveryPlan.create({
            data: { areaId: r.areaId },
          });
          await link("plan", r.sourceId, p.id, hash(r.areaId));
          parent = await tx.legacyReference.findUniqueOrThrow({
            where: {
              source_entityType_sourceId: {
                source: mapping.source,
                entityType: "plan",
                sourceId: r.sourceId,
              },
            },
          });
        }
        const actor = await legacyActor(r.actor, r.actor),
          d = r.data;
        const v = await tx.recoveryPlanVersion.create({
          data: {
            planId: parent.targetId,
            revision: r.revision,
            name: d.name,
            stageId: d.stageId,
            lineId: d.lineId,
            startDate: day(d.startDate),
            initialBacklog: d.initialBacklog,
            quantityMode: d.quantityMode,
            archived: d.archived,
            note: d.note,
            actorId: actor.id,
            createdAt: r.createdAt,
            days: { create: d.days.map((d) => ({ ...d, date: day(d.date) })) },
            actions: {
              create: d.actions.map((a) => ({
                ...a,
                startDate: day(a.startDate),
                endDate: day(a.endDate),
              })),
            },
            costs: { create: d.costs },
          },
        });
        await tx.recoveryPlan.update({
          where: { id: parent.targetId },
          data: { currentRevision: r.revision },
        });
        await link("plan-version", versionKey, v.id, checksum);
      }

      for (const r of preparedTargets.sort(
        (a, b) =>
          a.data.effectiveFrom.localeCompare(b.data.effectiveFrom) ||
          +a.createdAt - +b.createdAt,
      )) {
        const checksum = hash(r);
        if (await existing("target", r.sourceId, checksum)) continue;
        const actor = await legacyActor(r.actor, r.actor),
          d = r.data;
        const schedule = await tx.targetSchedule.upsert({
          where: {
            lineStageId_shiftId: {
              lineStageId: d.lineStageId,
              shiftId: d.shiftId,
            },
          },
          create: {
            lineStageId: d.lineStageId,
            shiftId: d.shiftId,
            revision: 1,
          },
          update: { revision: { increment: 1 } },
        });
        const version = await tx.targetVersion.create({
          data: {
            scheduleId: schedule.id,
            revision: schedule.revision,
            kind: "CONFIGURATION",
            effectiveFrom: day(d.effectiveFrom),
            enabled: d.enabled,
            capacity: d.capacity,
            efficiencyPercent: d.efficiencyPercent,
            quantityTarget: d.quantityTarget,
            actorId: actor.id,
            createdAt: r.createdAt,
          },
        });
        await link("target", r.sourceId, version.id, checksum);
      }
      for (const r of preparedAudit) {
        const checksum = hash(r);
        if (await existing("audit", r.sourceId, checksum)) continue;
        const actor = await legacyActor(r.actor, r.actor),
          a = await tx.area.findUniqueOrThrow({
            where: { id: r.areaId },
            include: { factory: { include: { unit: true } } },
          });
        const event = await tx.auditEvent.create({
          data: {
            actorId: actor.id,
            unitKey: a.factory.unit.accessKey,
            entityType: "legacy-record",
            entityId: mapping.source + ":" + r.recordId,
            action: r.action,
            occurredAt: r.occurredAt,
            before: r.before,
            after: r.after,
          },
        });
        await link("audit", r.sourceId, event.id, checksum);
      }
      const migration = await legacyActor("migration", "Legacy migration");
      await tx.auditEvent.create({
        data: {
          actorId: migration.id,
          entityType: "migration",
          entityId: mapping.source,
          action: "IMPORT",
          after: counts,
        },
      });
      return { dryRun: false, counts };
    },
    { isolationLevel: "Serializable", timeout: 120000 },
  );
}
if (process.argv[1]?.endsWith("import-legacy.ts")) {
  const args = process.argv.slice(2),
    file = args[args.indexOf("--backup") + 1],
    map = args[args.indexOf("--mapping") + 1];
  if (!args.includes("--backup") || !args.includes("--mapping"))
    throw Error(
      "Use --backup private/backup.json --mapping private/mapping.json [--apply]",
    );
  const db = new PrismaClient();
  try {
    console.log(
      JSON.stringify(
        await importLegacy(
          db,
          JSON.parse(await readFile(file, "utf8")),
          JSON.parse(await readFile(map, "utf8")),
          args.includes("--apply"),
        ),
      ),
    );
  } finally {
    await db.$disconnect();
  }
}
