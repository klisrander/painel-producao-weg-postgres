import type { ActionInput, PlanDayInput, CostInput } from "@panel/contracts";
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export function metrics(
  quantity: number,
  defects: number,
  capacity: number | null,
  rate: number | null,
  legacyTarget: number | null = null,
) {
  const target =
    capacity != null && rate != null
      ? Math.ceil((capacity * rate) / 100)
      : legacyTarget;
  return {
    quantity,
    defects,
    good: quantity - defects,
    ppm: quantity ? Math.round((defects / quantity) * 1e6) : 0,
    capacity,
    efficiency: capacity ? (quantity / capacity) * 100 : null,
    target,
    achieved: target == null ? null : quantity >= target,
  };
}
export function actionApplies(a: ActionInput, date: string) {
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  return (
    a.status !== "CANCELLED" &&
    date >= a.startDate &&
    date <= a.endDate &&
    (a.calendar === "ALL" ||
      (a.calendar === "SATURDAY" && weekday === 6) ||
      (a.calendar === "WEEKDAYS" && weekday > 0 && weekday < 6))
  );
}
export function overtime(c: CostInput) {
  const daily =
    c.people * (c.hourly * c.premium * c.charges * c.dsm * c.hours + c.food);
  return {
    daily: Math.round(daily * 100) / 100,
    unit: c.dailyExtra ? daily / c.dailyExtra : null,
    total: c.dailyExtra ? Math.ceil(c.volume / c.dailyExtra) * daily : null,
  };
}
export function project(
  initialBacklog: number,
  days: PlanDayInput[],
  actions: ActionInput[],
  today: string,
  actuals: Record<
    string,
    {
      quantity: number;
      defects: number;
      recovery: number;
      recoveryDefects: number;
    }
  > = {},
  good = false,
) {
  let balance: number | null = -Math.abs(initialBacklog),
    current: number | null = balance,
    zeroDate: string | null = null,
    cost = 0;
  const issues: { date: string; code: string }[] = [];
  const source = [...days];
  const dates = new Set(days.map((d) => d.date));
  const first = days[0]?.date,
    last = days.at(-1)?.date;
  for (const [date, a] of Object.entries(actuals))
    if (
      first &&
      last &&
      date >= first &&
      date <= last &&
      !dates.has(date) &&
      a.recovery > 0
    )
      source.push({
        date,
        demand: 0,
        forecast: 0,
        actualOverride: null,
        actualReason: "",
        adjustment: 0,
        adjustmentReason: "",
        note: "",
        closed: true,
        recoveryOnly: true,
      });
  const rows = source
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const record = actuals[d.date];
      const real =
        d.actualOverride ??
        (record
          ? d.recoveryOnly
            ? record.recovery - (good ? record.recoveryDefects : 0)
            : record.quantity - (good ? record.defects : 0)
          : null);
      const closed =
        d.date < today ||
        (d.date === today && (d.closed || d.actualOverride != null));
      const applicable = actions.filter((a) => actionApplies(a, d.date));
      const forecast =
        d.forecast == null
          ? null
          : d.forecast + applicable.reduce((n, a) => n + a.extraUnits, 0);
      const used = closed ? real : forecast,
        opening = balance;
      if (d.demand == null)
        issues.push({ date: d.date, code: "missing_demand" });
      if (used == null)
        issues.push({
          date: d.date,
          code: closed ? "missing_actual" : "missing_forecast",
        });
      balance =
        balance == null || d.demand == null || used == null
          ? null
          : balance + used - d.demand - d.adjustment;
      if (d.date < today) current = balance;
      if (balance != null && balance >= 0 && !zeroDate) zeroDate = d.date;
      return {
        ...d,
        actual: real,
        forecastTotal: forecast,
        used,
        opening,
        closing: balance,
        closed,
      };
    });
  if (first && last)
    for (
      let d = new Date(first + "T12:00:00Z");
      isoDate(d) <= last;
      d.setUTCDate(d.getUTCDate() + 1)
    )
      for (const a of actions)
        if (actionApplies(a, isoDate(d))) cost += a.costPerDay;
  return {
    rows,
    current,
    final: balance,
    zeroDate,
    cost: Math.round(cost * 100) / 100,
    issues,
    complete: !issues.length,
  };
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return (
    '"' +
    (/^[\s]*[=+@-]/.test(text) ? "'" : "") +
    text.replaceAll('"', '""') +
    '"'
  );
}
export const csv = (rows: unknown[][]) =>
  "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");

export { workbook, type Sheet } from "./xlsx.js";
