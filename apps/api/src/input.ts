import { z } from "zod";
import { DateTime } from "luxon";
import { actionKinds, actionStatuses, calendars } from "@panel/contracts";
export const id = z.uuid();
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v).isValid, "invalid_date");
const text = (max = 160) => z.string().trim().min(1).max(max);
const optionalText = (max = 500) => z.string().trim().max(max).default("");
const qty = z.number().int().min(0).max(1_000_000_000);
const optionalQty = qty.nullable();
export const pagination = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce
      .number()
      .refine((n) => [10, 30, 50, 100].includes(n))
      .default(30),
    from: date,
    to: date,
    areaId: id,
    stageId: id.optional(),
    lineId: id.optional(),
    shiftId: id.optional(),
  })
  .refine(
    (v) =>
      v.to >= v.from &&
      DateTime.fromISO(v.to).diff(DateTime.fromISO(v.from), "days").days <= 366,
    "invalid_interval",
  );
export const productionInput = z
  .object({
    operationDate: date,
    lineStageId: id,
    shiftId: id,
    quantity: qty,
    defects: qty,
    recovery: z.boolean().default(false),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .refine((v) => v.defects <= v.quantity, "invalid_defects");
export const stopInput = z
  .object({
    operationDate: date,
    equipmentId: id,
    reasonId: id,
    shiftId: id,
    comment: optionalText(),
    durationMinutes: z.number().int().min(1).max(1440),
    startedAt: z.iso.datetime({ offset: true }).nullable().default(null),
    endedAt: z.iso.datetime({ offset: true }).nullable().default(null),
    version: z.number().int().positive().optional(),
  })
  .strict()
  .refine(
    (v) => (v.startedAt === null) === (v.endedAt === null),
    "both_times_required",
  )
  .refine(
    (v) =>
      !v.startedAt ||
      !v.endedAt ||
      (new Date(v.endedAt) > new Date(v.startedAt) &&
        +new Date(v.endedAt) - +new Date(v.startedAt) ===
          v.durationMinutes * 60000),
    "invalid_duration",
  );
export const targetInput = z
  .object({
    lineStageId: id,
    shiftId: id,
    effectiveFrom: date,
    enabled: z.boolean(),
    capacity: qty.nullable(),
    efficiencyPercent: z.number().min(0).max(100).nullable(),
    quantityTarget: qty.nullable().default(null),
    expectedRevision: z.number().int().min(0),
  })
  .strict()
  .refine(
    (v) => (v.capacity == null) === (v.efficiencyPercent == null),
    "capacity_rate_pair",
  )
  .refine(
    (v) => v.capacity == null || v.quantityTarget == null,
    "use_capacity_or_quantity_target",
  )
  .refine(
    (v) => !v.enabled || v.capacity != null || v.quantityTarget != null,
    "target_required",
  );
export const dayInput = z
  .object({
    date,
    demand: optionalQty,
    forecast: optionalQty,
    actualOverride: optionalQty,
    actualReason: optionalText(),
    adjustment: z.number().int().min(-1e9).max(1e9).default(0),
    adjustmentReason: optionalText(),
    note: optionalText(),
    closed: z.boolean().default(false),
    recoveryOnly: z.boolean().default(false),
  })
  .strict()
  .refine(
    (v) => v.actualOverride == null || !!v.actualReason,
    "actual_reason_required",
  )
  .refine(
    (v) => !v.adjustment || !!v.adjustmentReason,
    "adjustment_reason_required",
  );
export const actionInput = z
  .object({
    lineId: id.nullable().optional(),
    title: text(150),
    kind: z.enum(actionKinds),
    status: z.enum(actionStatuses),
    calendar: z.enum(calendars),
    startDate: date,
    endDate: date,
    responsible: optionalText(100),
    extraUnits: qty,
    costPerDay: z.number().min(0).max(1e9),
    note: optionalText(),
  })
  .strict()
  .refine(
    (v) =>
      v.endDate >= v.startDate &&
      DateTime.fromISO(v.endDate).diff(DateTime.fromISO(v.startDate), "days")
        .days <= 730,
    "invalid_interval",
  );
const decimal = z.number().min(0).max(1e8);
export const costsInput = z
  .object({
    hourly: decimal,
    premium: decimal,
    charges: decimal,
    dsm: decimal,
    hours: decimal.max(24),
    food: decimal,
    people: qty,
    volume: qty,
    dailyExtra: qty,
  })
  .strict();
export const planInput = z
  .object({
    name: text(100),
    stageId: id,
    lineId: id.nullable().optional(),
    startDate: date,
    initialBacklog: qty,
    quantityMode: z.enum(["TOTAL", "GOOD"]),
    archived: z.boolean().default(false),
    note: optionalText(),
    days: z.array(dayInput).min(1).max(366),
    actions: z.array(actionInput).max(100),
    costs: costsInput,
    expectedRevision: z.number().int().min(0),
  })
  .strict()
  .refine(
    (v) =>
      new Set(v.days.map((d) => d.date)).size === v.days.length &&
      v.days.every(
        (d) =>
          d.date >= v.startDate &&
          DateTime.fromISO(d.date).diff(DateTime.fromISO(v.startDate), "days")
            .days <= 730,
      ) &&
      v.days.some((d) => d.date === v.startDate),
    "invalid_plan_dates",
  );
const base = { code: text(50), name: text() };
export const resourceInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("organization"), ...base }),
  z.object({
    kind: z.literal("unit"),
    parentId: id,
    ...base,
    accessKey: text(100),
    timeZone: text(80).refine((v) => DateTime.now().setZone(v).isValid),
  }),
  z.object({ kind: z.literal("factory"), parentId: id, ...base }),
  z.object({ kind: z.literal("area"), parentId: id, ...base }),
  z.object({ kind: z.literal("line"), parentId: id, ...base }),
  z.object({ kind: z.literal("stage"), parentId: id, ...base }),
  z.object({ kind: z.literal("reason"), parentId: id, ...base }),
  z.object({
    kind: z.literal("equipment"),
    parentId: id,
    code: text(60),
    name: text(200),
    workCenter: optionalText(60),
    assetCode: optionalText(100),
  }),
  z.object({ kind: z.literal("lineStage"), lineId: id, stageId: id }),
  z.object({
    kind: z.literal("shift"),
    parentId: id,
    code: text(30),
    name: text(100),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(0).max(1439),
  }),
  z
    .object({
      kind: z.literal("calendar"),
      shiftId: id,
      weekday: z.number().int().min(1).max(7),
      anchorDate: date,
      intervalWeeks: z.number().int().min(1).max(52),
      enabled: z.boolean(),
      startMinute: z.number().int().min(0).max(1439).nullable(),
      endMinute: z.number().int().min(0).max(1439).nullable(),
    })
    .refine(
      (v) => (v.startMinute == null) === (v.endMinute == null),
      "both_times_required",
    ),
]);
export const recipientInput = z
  .object({
    unitId: id,
    address: z.email().max(254),
    locale: z.enum(["pt-BR", "en-US", "es-ES"]),
    enabled: z.boolean(),
  })
  .strict();
