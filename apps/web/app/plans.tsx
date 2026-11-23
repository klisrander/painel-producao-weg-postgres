"use client";
import { useEffect, useState } from "react";
import type {
  Locale,
  PlanInput,
  PlanDayInput,
  ActionInput,
  CostInput,
} from "@panel/contracts";
import { actionKinds, actionStatuses, calendars } from "@panel/contracts";
import { overtime, csv, workbook, type Sheet } from "@panel/domain";
import { Field, Select, type T } from "./panel";
import type { Area } from "../lib/types";
import {
  api,
  datePart,
  today,
  download,
  downloadBytes,
  numeric,
} from "../lib/client";
type Version = PlanInput & { id: string; revision: number };
type SavedPlan = { id: string; currentRevision: number; versions: Version[] };
type Projection = {
  rows: (PlanDayInput & {
    actual: number | null;
    opening: number | null;
    closing: number | null;
  })[];
  current: number | null;
  final: number | null;
  zeroDate: string | null;
  cost: number;
  complete: boolean;
  issues: { date: string; code: string }[];
};
const costs: CostInput = {
  hourly: 0,
  premium: 2,
  charges: 1.7445,
  dsm: 1.2,
  hours: 8.8,
  food: 0,
  people: 0,
  volume: 0,
  dailyExtra: 0,
};
const newDay = (date = today()): PlanDayInput => ({
  date,
  demand: null,
  forecast: null,
  actualOverride: null,
  actualReason: "",
  adjustment: 0,
  adjustmentReason: "",
  note: "",
  closed: false,
  recoveryOnly: false,
});
const blank = (area: Area): PlanInput => ({
  name: "",
  stageId: area.stages[0]?.id || "",
  lineId: null,
  startDate: today(),
  initialBacklog: 0,
  quantityMode: "TOTAL",
  archived: false,
  note: "",
  days: [newDay()],
  actions: [],
  costs: { ...costs },
  expectedRevision: 0,
});
function editVersion(v: Version): PlanInput {
  return {
    name: v.name,
    stageId: v.stageId,
    lineId: v.lineId,
    startDate: datePart(v.startDate),
    initialBacklog: v.initialBacklog,
    quantityMode: v.quantityMode,
    archived: v.archived,
    note: v.note,
    expectedRevision: v.revision,
    days: v.days.map((d) => ({
      date: datePart(d.date),
      demand: d.demand,
      forecast: d.forecast,
      actualOverride: d.actualOverride,
      actualReason: d.actualReason,
      adjustment: d.adjustment,
      adjustmentReason: d.adjustmentReason,
      note: d.note,
      closed: d.closed,
      recoveryOnly: d.recoveryOnly,
    })),
    actions: v.actions.map((a) => ({
      lineId: a.lineId,
      title: a.title,
      kind: a.kind,
      status: a.status,
      included: a.included ?? true,
      calendar: a.calendar,
      startDate: datePart(a.startDate),
      endDate: datePart(a.endDate),
      responsible: a.responsible,
      extraUnits: a.extraUnits,
      costPerDay: Number(a.costPerDay),
      note: a.note,
    })),
    costs: Object.fromEntries(
      Object.entries(v.costs || costs)
        .filter(([k]) => k in costs)
        .map(([k, n]) => [k, Number(n)]),
    ) as unknown as CostInput,
  };
}
export function PlanEditor({
  t,
  locale,
  area,
  canEdit,
  run,
  busy,
}: {
  t: T;
  locale: Locale;
  area: Area;
  canEdit: boolean;
  run: (f: () => Promise<unknown>) => void;
  busy: boolean;
}) {
  const [plans, setPlans] = useState<SavedPlan[]>([]),
    [id, setId] = useState(""),
    [draft, setDraft] = useState<PlanInput>(() => blank(area)),
    [projection, setProjection] = useState<Projection | null>(null),
    [comparison, setComparison] = useState<Projection | null>(null),
    [compareId, setCompareId] = useState(""),
    [error, setError] = useState(""),
    [versions, setVersions] = useState<
      { revision: number; createdAt: string; actor: { displayName: string } }[]
    >([]);
  useEffect(() => {
    api<SavedPlan[]>("plans?areaId=" + area.id)
      .then(setPlans)
      .catch((e) => setError(e.message));
  }, [area.id]);
  useEffect(() => {
    if (!id) {
      setProjection(null);
      setVersions([]);
      return;
    }
    setError("");
    api<Projection>("plans/" + id + "/projection")
      .then(setProjection)
      .catch((e) => setError(e.message));
    api<typeof versions>("plans/" + id + "/revisions")
      .then(setVersions)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (!compareId) {
      setComparison(null);
      return;
    }
    api<Projection>("plans/" + compareId + "/projection")
      .then(setComparison)
      .catch((e) => setError(e.message));
  }, [compareId]);
  function select(value: string) {
    setId(value);
    const p = plans.find((p) => p.id === value);
    setDraft(p?.versions[0] ? editVersion(p.versions[0]) : blank(area));
  }
  function update<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function changeDay(index: number, patch: Partial<PlanDayInput>) {
    update(
      "days",
      draft.days.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  }
  function changeAction(index: number, patch: Partial<ActionInput>) {
    update(
      "actions",
      draft.actions.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );
  }
  const amount = (n: number | null) =>
      n == null ? "—" : n.toLocaleString(locale),
    he = overtime(draft.costs);
  return (
    <>
      <section className="card">
        <div className="toolbar">
          <h2>{t("plans")}</h2>
          {canEdit && <button onClick={() => select("")}>{t("new")}</button>}
        </div>
        <p>{t("planHelp")}</p>
        {error && <p role="alert">{t(error)}</p>}
        <div className="form-grid">
          <Select
            label={t("plans")}
            value={id}
            onChange={select}
            options={plans
              .filter((p) => p.versions[0])
              .map((p) => ({
                id: p.id,
                name:
                  p.versions[0].name +
                  (p.versions[0].archived ? " · " + t("archived") : ""),
              }))}
            all={t("new")}
          />
          {id && (
            <Select
              label={t("compare")}
              value={compareId}
              onChange={setCompareId}
              options={plans
                .filter((p) => p.id !== id && p.versions[0])
                .map((p) => ({ id: p.id, name: p.versions[0].name }))}
              all={t("noComparison")}
            />
          )}
        </div>
        {projection && (
          <>
            <div className="stats">
              {(["current", "final", "zeroDate", "cost"] as const).map(
                (key) => (
                  <div className="mini-stat" key={key}>
                    <span>{t(key)}</span>
                    <strong>
                      {key === "zeroDate"
                        ? projection.zeroDate || t("notZero")
                        : amount(projection[key])}
                    </strong>
                    {comparison && (
                      <small>
                        {t("compare")}:{" "}
                        {key === "zeroDate"
                          ? comparison.zeroDate || t("notZero")
                          : amount(comparison[key])}
                      </small>
                    )}
                  </div>
                ),
              )}
            </div>
            {!projection.complete && (
              <div className="notice">
                <p>{t("incomplete")}</p>
                <ul>
                  {projection.issues.slice(0, 20).map((issue, i) => (
                    <li key={i}>
                      {issue.date}: {t(issue.code)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <BalanceChart a={projection} b={comparison} t={t} />
            <div className="toolbar">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const sheets: Sheet[] = [
                    {
                      name: t("projection"),
                      rows: [
                        [
                          t("date"),
                          t("opening"),
                          t("demand"),
                          t("forecast"),
                          t("actualOverride"),
                          t("closing"),
                        ],
                        ...projection.rows.map((r) => [
                          r.date,
                          r.opening,
                          r.demand,
                          r.forecast,
                          r.actual,
                          r.closing,
                        ]),
                      ],
                    },
                    {
                      name: t("action"),
                      rows: [
                        [
                          t("name"),
                          t("startDate"),
                          t("endDate"),
                          t("status"),
                          t("extraUnits"),
                          t("costPerDay"),
                        ],
                        ...draft.actions.map((a) => [
                          a.title,
                          a.startDate,
                          a.endDate,
                          t(a.status),
                          a.extraUnits,
                          a.costPerDay,
                        ]),
                      ],
                    },
                    {
                      name: t("costs"),
                      rows: [
                        [t("name"), t("cost")],
                        ...Object.entries(draft.costs).map(([key, n]) => [
                          t(key),
                          n,
                        ]),
                      ],
                    },
                  ];
                  if (comparison)
                    sheets.push({
                      name: t("compare"),
                      rows: [
                        [t("date"), t("closing")],
                        ...comparison.rows.map((r) => [r.date, r.closing]),
                      ],
                    });
                  downloadBytes(
                    workbook(sheets, {
                      sheetIndex: 0,
                      xColumn: 0,
                      yColumn: 5,
                      title: t("projection"),
                    }),
                    "projection.xlsx",
                  );
                }}
              >
                Excel
              </button>
              <button
                className="secondary"
                onClick={() =>
                  download(
                    csv([
                      [
                        t("date"),
                        t("opening"),
                        t("demand"),
                        t("forecast"),
                        t("actualOverride"),
                        t("closing"),
                      ],
                      ...projection.rows.map((r) => [
                        r.date,
                        r.opening,
                        r.demand,
                        r.forecast,
                        r.actual,
                        r.closing,
                      ]),
                    ]),
                    "projection.csv",
                  )
                }
              >
                {t("export")}
              </button>
              {canEdit && (
                <button
                  onClick={() => {
                    setId("");
                    setDraft({
                      ...draft,
                      name: draft.name + " · " + t("clone"),
                      expectedRevision: 0,
                    });
                  }}
                >
                  {t("clone")}
                </button>
              )}
            </div>
            <div className="table-wrap projection-table">
              <table>
                <thead>
                  <tr>
                    {[
                      "date",
                      "opening",
                      "demand",
                      "forecast",
                      "actualOverride",
                      "closing",
                    ].map((k) => (
                      <th key={k}>{t(k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projection.rows.map((r) => (
                    <tr key={r.date}>
                      <td>{r.date}</td>
                      {[
                        r.opening,
                        r.demand,
                        r.forecast,
                        r.actual,
                        r.closing,
                      ].map((n, i) => (
                        <td key={i}>{amount(n)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-projection">
              {projection.rows.map((r) => (
                <details key={r.date}>
                  <summary>
                    {r.date} · {t("closing")}: {amount(r.closing)}
                  </summary>
                  <div className="data-grid">
                    {[
                      ["opening", r.opening],
                      ["demand", r.demand],
                      ["forecast", r.forecast],
                      ["actualOverride", r.actual],
                    ].map(([key, value]) => (
                      <p key={key}>
                        <span>{t(String(key))}</span>
                        <b>{amount(value as number | null)}</b>
                      </p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </>
        )}
      </section>
      {canEdit && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api(
                "plans" + (id ? "/" + id : "") + "?areaId=" + area.id,
                id ? "PUT" : "POST",
                {
                  ...draft,
                  days: [...draft.days].sort((a, b) =>
                    a.date.localeCompare(b.date),
                  ),
                },
              );
            });
          }}
        >
          <h2>{t(id ? "edit" : "new")}</h2>
          <div className="form-grid">
            <Field label={t("name")}>
              <input
                value={draft.name}
                onChange={(e) => update("name", e.target.value)}
                maxLength={100}
                required
              />
            </Field>
            <Select
              label={t("stage")}
              value={draft.stageId}
              onChange={(v) => update("stageId", v)}
              options={area.stages}
            />
            <Select
              label={t("line")}
              value={draft.lineId || ""}
              onChange={(v) => update("lineId", v || null)}
              options={area.lines.filter((l) =>
                l.stages.some((s) => s.stageId === draft.stageId),
              )}
              all={t("all")}
            />
            <Field label={t("startDate")}>
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => update("startDate", e.target.value)}
                required
              />
            </Field>
            <Field label={t("initialBacklog")}>
              <input
                type="number"
                min="0"
                value={draft.initialBacklog}
                onChange={(e) =>
                  update("initialBacklog", Number(e.target.value))
                }
                required
              />
            </Field>
            <Field label={t("quantityMode")}>
              <select
                value={draft.quantityMode}
                onChange={(e) =>
                  update("quantityMode", e.target.value as "TOTAL" | "GOOD")
                }
              >
                <option value="TOTAL">{t("TOTAL")}</option>
                <option value="GOOD">{t("GOOD")}</option>
              </select>
            </Field>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.archived}
                onChange={(e) => update("archived", e.target.checked)}
              />
              {t("archived")}
            </label>
            <Field label={t("note")}>
              <textarea
                maxLength={500}
                value={draft.note}
                onChange={(e) => update("note", e.target.value)}
              />
            </Field>
          </div>
          <h3>{t("day")}</h3>
          {draft.days.map((d, i) => (
            <details key={i} open={i === draft.days.length - 1}>
              <summary>{d.date || t("new")}</summary>
              <div className="form-grid">
                <Field label={t("date")}>
                  <input
                    type="date"
                    value={d.date}
                    min={draft.startDate}
                    onChange={(e) => changeDay(i, { date: e.target.value })}
                    required
                  />
                </Field>
                {(["demand", "forecast", "actualOverride"] as const).map(
                  (key) => (
                    <Field key={key} label={t(key)}>
                      <input
                        type="number"
                        min="0"
                        max="1000000000"
                        value={d[key] ?? ""}
                        onChange={(e) =>
                          changeDay(i, { [key]: numeric(e.target.value) })
                        }
                      />
                    </Field>
                  ),
                )}
                <Field label={t("adjustment")}>
                  <input
                    type="number"
                    value={d.adjustment}
                    onChange={(e) =>
                      changeDay(i, { adjustment: Number(e.target.value) })
                    }
                  />
                </Field>
                {(["actualReason", "adjustmentReason", "note"] as const).map(
                  (key) => (
                    <Field key={key} label={t(key)}>
                      <input
                        maxLength={500}
                        value={d[key]}
                        onChange={(e) =>
                          changeDay(i, { [key]: e.target.value })
                        }
                        required={
                          key === "actualReason"
                            ? d.actualOverride != null
                            : key === "adjustmentReason"
                              ? !!d.adjustment
                              : false
                        }
                      />
                    </Field>
                  ),
                )}
                {(["closed", "recoveryOnly"] as const).map((key) => (
                  <label className="check" key={key}>
                    <input
                      type="checkbox"
                      checked={d[key]}
                      onChange={(e) =>
                        changeDay(i, { [key]: e.target.checked })
                      }
                    />
                    {t(key)}
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="secondary"
                disabled={draft.days.length === 1}
                onClick={() =>
                  update(
                    "days",
                    draft.days.filter((_, n) => n !== i),
                  )
                }
              >
                {t("remove")}
              </button>
            </details>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={draft.days.length >= 366}
            onClick={() => {
              const last = draft.days.at(-1)!.date,
                d = new Date(last + "T12:00:00Z");
              d.setUTCDate(d.getUTCDate() + 1);
              update("days", [
                ...draft.days,
                newDay(d.toISOString().slice(0, 10)),
              ]);
            }}
          >
            {t("addDay")}
          </button>
          <h3>{t("action")}</h3>
          {draft.actions.map((a, i) => (
            <details key={i} open>
              <summary>{a.title || t("new")}</summary>
              <div className="form-grid">
                <Field label={t("name")}>
                  <input
                    maxLength={150}
                    value={a.title}
                    onChange={(e) => changeAction(i, { title: e.target.value })}
                    required
                  />
                </Field>
                <Select
                  label={t("line")}
                  value={a.lineId || ""}
                  onChange={(v) => changeAction(i, { lineId: v || null })}
                  options={area.lines}
                  all={t("all")}
                />
                {(["kind", "status", "calendar"] as const).map((key) => (
                  <Field key={key} label={t(key)}>
                    <select
                      value={a[key]}
                      onChange={(e) =>
                        changeAction(i, { [key]: e.target.value })
                      }
                    >
                      {(key === "kind"
                        ? actionKinds
                        : key === "status"
                          ? actionStatuses
                          : calendars
                      ).map((v) => (
                        <option key={v} value={v}>
                          {t(v)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ))}
                {(["startDate", "endDate"] as const).map((key) => (
                  <Field key={key} label={t(key)}>
                    <input
                      type="date"
                      value={a[key]}
                      onChange={(e) =>
                        changeAction(i, { [key]: e.target.value })
                      }
                      required
                    />
                  </Field>
                ))}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={a.included}
                    onChange={(e) =>
                      changeAction(i, { included: e.target.checked })
                    }
                  />
                  {t("includeAction")}
                </label>
                <Field label={t("responsible")}>
                  <input
                    value={a.responsible}
                    maxLength={100}
                    onChange={(e) =>
                      changeAction(i, { responsible: e.target.value })
                    }
                  />
                </Field>
                {(["extraUnits", "costPerDay"] as const).map((key) => (
                  <Field key={key} label={t(key)}>
                    <input
                      type="number"
                      min="0"
                      step={key === "costPerDay" ? "0.01" : "1"}
                      value={a[key]}
                      onChange={(e) =>
                        changeAction(i, { [key]: Number(e.target.value) })
                      }
                      required
                    />
                  </Field>
                ))}
                <Field label={t("note")}>
                  <input
                    maxLength={500}
                    value={a.note}
                    onChange={(e) => changeAction(i, { note: e.target.value })}
                  />
                </Field>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  update(
                    "actions",
                    draft.actions.filter((_, n) => n !== i),
                  )
                }
              >
                {t("remove")}
              </button>
            </details>
          ))}
          <button
            type="button"
            className="secondary"
            disabled={draft.actions.length >= 100}
            onClick={() =>
              update("actions", [
                ...draft.actions,
                {
                  lineId: null,
                  title: "",
                  kind: "OVERTIME",
                  status: "PLANNED",
                  included: true,
                  calendar: "ALL",
                  startDate: draft.startDate,
                  endDate: draft.startDate,
                  responsible: "",
                  extraUnits: 0,
                  costPerDay: 0,
                  note: "",
                },
              ])
            }
          >
            {t("addAction")}
          </button>
          <details>
            <summary>{t("costs")}</summary>
            <div className="form-grid">
              {(Object.keys(costs) as (keyof CostInput)[]).map((key) => (
                <Field key={key} label={t(key)}>
                  <input
                    type="number"
                    min="0"
                    step={
                      ["people", "volume", "dailyExtra"].includes(key)
                        ? "1"
                        : "0.0001"
                    }
                    value={draft.costs[key]}
                    onChange={(e) =>
                      update("costs", {
                        ...draft.costs,
                        [key]: Number(e.target.value),
                      })
                    }
                    required
                  />
                </Field>
              ))}
            </div>
            <p>
              {t("daily")}: {amount(he.daily)} · {t("total")}:{" "}
              {amount(he.total)}
            </p>
          </details>
          <div className="toolbar">
            <button disabled={busy}>{t("save")}</button>
            <span>
              {t("version")}: {draft.expectedRevision}
            </span>
          </div>
        </form>
      )}
      {versions.length > 0 && (
        <section className="card">
          <h2>{t("history")}</h2>
          {versions.map((v) => (
            <p key={v.revision}>
              {t("version")} {v.revision} ·{" "}
              {v.createdAt.slice(0, 19).replace("T", " ")} ·{" "}
              {v.actor.displayName}
            </p>
          ))}
        </section>
      )}
    </>
  );
}
function BalanceChart({
  a,
  b,
  t,
}: {
  a: Projection;
  b: Projection | null;
  t: T;
}) {
  const dates = [
      ...new Set([...a.rows, ...(b?.rows || [])].map((r) => r.date)),
    ].sort(),
    values = [...a.rows, ...(b?.rows || [])].flatMap((r) =>
      r.closing == null ? [] : [r.closing],
    ),
    low = Math.min(0, ...values),
    high = Math.max(1, ...values),
    y = (n: number) => 190 - ((n - low) / (high - low)) * 160;
  return (
    <div className="chart">
      <svg viewBox="0 0 800 230" role="img" aria-label={t("projection")}>
        <line x1="45" x2="780" y1={y(0)} y2={y(0)} stroke="#c7d6e3" />
        {[a, b].map(
          (p, i) =>
            p && (
              <g key={i}>
                {p.rows.map((r, n) => {
                  const previous = p.rows[n - 1];
                  return r.closing != null && previous?.closing != null ? (
                    <line
                      key={r.date}
                      x1={
                        50 +
                        (dates.indexOf(previous.date) * 720) /
                          Math.max(1, dates.length - 1)
                      }
                      x2={
                        50 +
                        (dates.indexOf(r.date) * 720) /
                          Math.max(1, dates.length - 1)
                      }
                      y1={y(previous.closing)}
                      y2={y(r.closing)}
                      stroke={i ? "#00a7b8" : "#005b99"}
                      strokeWidth="3"
                    />
                  ) : null;
                })}
                {p.rows
                  .filter((r) => r.closing != null)
                  .map((r) => (
                    <circle
                      key={r.date}
                      cx={
                        50 +
                        (dates.indexOf(r.date) * 720) /
                          Math.max(1, dates.length - 1)
                      }
                      cy={y(r.closing!)}
                      r="4"
                      fill={i ? "#00a7b8" : "#005b99"}
                    >
                      <title>
                        {r.date}: {r.closing}
                      </title>
                    </circle>
                  ))}
              </g>
            ),
        )}
        <text x="50" y="220" fontSize="12">
          {dates[0]}
        </text>
        <text x="760" y="220" fontSize="12" textAnchor="end">
          {dates.at(-1)}
        </text>
      </svg>
    </div>
  );
}
