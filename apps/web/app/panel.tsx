"use client";
import {
  useState,
  useEffect,
  useCallback,
  type ReactNode,
  type FormEvent,
} from "react";
import type {
  Principal,
  Permission,
  Locale,
  Page,
  PlanInput,
} from "@panel/contracts";
import { translate, type Key } from "../lib/i18n";
import type {
  Organization,
  Unit,
  Area,
  Target,
  RecordRow,
  Summary,
  SummaryRow,
} from "../lib/types";
import { api, today, datePart, download, numeric } from "../lib/client";
import { PlanEditor } from "./plans";
export type T = (key: string) => string;
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  all = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
  all?: string | false;
  disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={!all}
      >
        {all && <option value="">{all}</option>}
        {!all && (
          <option value="" disabled>
            —
          </option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function Chart({
  rows,
  t,
  locale,
}: {
  rows: SummaryRow[];
  t: T;
  locale: Locale;
}) {
  const dates = [...new Set(rows.map((r) => r.date))].sort(),
    shifts = [...new Map(rows.map((r) => [r.shiftId, r.shift])).entries()];
  const max = Math.max(
    1,
    ...dates.flatMap((d) =>
      shifts.map(([id]) =>
        rows
          .filter((r) => r.date === d && r.shiftId === id)
          .reduce((n, r) => n + r.quantity, 0),
      ),
    ),
  );
  return (
    <div className="chart">
      <svg viewBox="0 0 800 250" role="img" aria-label={t("dashboard")}>
        <line x1="45" x2="780" y1="210" y2="210" stroke="#c3d1de" />
        {shifts.map(([id, name], index) => {
          const color = ["#005b99", "#00a7b8", "#e59827", "#8759b6"][index % 4];
          return (
            <g key={id}>
              <polyline
                fill="none"
                stroke={color}
                strokeWidth="3"
                points={dates
                  .map(
                    (d, i) =>
                      `${50 + (i * 720) / Math.max(1, dates.length - 1)},${205 - (rows.filter((r) => r.date === d && r.shiftId === id).reduce((n, r) => n + r.quantity, 0) / max) * 170}`,
                  )
                  .join(" ")}
              />
              {dates.map((d, i) => (
                <circle
                  key={d}
                  cx={50 + (i * 720) / Math.max(1, dates.length - 1)}
                  cy={
                    205 -
                    (rows
                      .filter((r) => r.date === d && r.shiftId === id)
                      .reduce((n, r) => n + r.quantity, 0) /
                      max) *
                      170
                  }
                  r="4"
                  fill={color}
                >
                  <title>
                    {name} · {d}:{" "}
                    {rows
                      .filter((r) => r.date === d && r.shiftId === id)
                      .reduce((n, r) => n + r.quantity, 0)
                      .toLocaleString(locale)}
                  </title>
                </circle>
              ))}
              <text x={50 + index * 180} y="20" fill={color} fontSize="13">
                {name}
              </text>
            </g>
          );
        })}
        {dates
          .filter(
            (_, i) => i === 0 || i === dates.length - 1 || dates.length < 10,
          )
          .map((d) => (
            <text
              key={d}
              x={50 + (dates.indexOf(d) * 720) / Math.max(1, dates.length - 1)}
              y="235"
              textAnchor="middle"
              fontSize="11"
            >
              {d.slice(5)}
            </text>
          ))}
      </svg>
    </div>
  );
}
export default function Panel() {
  const [locale, setLocale] = useState<Locale>("pt-BR"),
    [principal, setPrincipal] = useState<Principal | null>(null),
    [checking, setChecking] = useState(true),
    [tree, setTree] = useState<Organization[]>([]),
    [section, setSection] = useState("dashboard"),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [organizationId, setOrg] = useState(""),
    [unitId, setUnit] = useState(""),
    [factoryId, setFactory] = useState(""),
    [areaId, setArea] = useState(""),
    [stageId, setStage] = useState(""),
    [lineId, setLine] = useState(""),
    [shiftId, setShift] = useState(""),
    [from, setFrom] = useState(today()),
    [to, setTo] = useState(today());
  const t = useCallback((k: string) => translate(locale, k), [locale]),
    can = (k: Permission) => !!principal?.permissions.includes(k);
  const organization = tree.find((o) => o.id === organizationId),
    unit = organization?.units.find((u) => u.id === unitId),
    factory = unit?.factories.find((f) => f.id === factoryId),
    area = factory?.areas.find((a) => a.id === areaId);
  const display = (v: {
    name: string;
    translations?: { locale: string; label: string }[];
  }) => v.translations?.find((x) => x.locale === locale)?.label || v.name;
  const query = new URLSearchParams({
    areaId,
    from,
    to,
    ...(stageId ? { stageId } : {}),
    ...(lineId ? { lineId } : {}),
    ...(shiftId ? { shiftId } : {}),
  }).toString();
  const reload = () => setRevision((r) => r + 1);
  async function refreshTree() {
    const data = await api<Organization[]>("tree");
    setTree(data);
    return data;
  }
  useEffect(() => {
    const auth = new URLSearchParams(window.location.search).get("auth");
    if (auth) setMsg(auth === "failed" ? "authFailed" : "authUnavailable");
    const saved = localStorage.getItem("panel-language");
    if (["pt-BR", "en-US", "es-ES"].includes(saved || ""))
      setLocale(saved as Locale);
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (r) => {
        if (r.ok) {
          setPrincipal((await r.json()).principal);
          await refreshTree();
        }
      })
      .catch((e) => setMsg(e.message || "service_unavailable"))
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem("panel-language", locale);
  }, [locale]);
  useEffect(() => {
    if (!organization && tree.length) setOrg(tree[0].id);
  }, [tree, organization]);
  useEffect(() => {
    if (organization && !unit) setUnit(organization.units[0]?.id || "");
  }, [organization, unit]);
  useEffect(() => {
    if (unit && !factory) setFactory(unit.factories[0]?.id || "");
  }, [unit, factory]);
  useEffect(() => {
    if (factory && !area) {
      setArea(factory.areas[0]?.id || "");
      setStage("");
      setLine("");
      setShift("");
    }
  }, [factory, area]);
  useEffect(() => {
    if (!principal) return;
    let lastSent = 0;
    const activity = (e: Event) => {
      if (!e.isTrusted || Date.now() - lastSent < 60000) return;
      lastSent = Date.now();
      fetch("/api/auth/activity", { method: "POST" })
        .then((r) => {
          if (r.status === 401) {
            setPrincipal(null);
            setMsg("unauthenticated");
          }
        })
        .catch(() => {});
    };
    for (const event of ["pointerdown", "keydown", "touchstart", "wheel"])
      window.addEventListener(event, activity, { passive: true });
    const timer = setInterval(() => {
      fetch("/api/auth/session", { cache: "no-store" })
        .then((r) => {
          if (r.status === 401) {
            setPrincipal(null);
            setMsg("unauthenticated");
          }
        })
        .catch(() => {});
    }, 60000);
    return () => {
      clearInterval(timer);
      for (const event of ["pointerdown", "keydown", "touchstart", "wheel"])
        window.removeEventListener(event, activity);
    };
  }, [principal]);
  async function run(action: () => Promise<unknown>, success = "saved") {
    setBusy(true);
    setMsg("");
    try {
      await action();
      setMsg(success);
      reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const nav: [string, Key, Permission?][] = [
    ["dashboard", "dashboard", "production.read"],
    ["production", "production", "production.read"],
    ["stops", "stops", "stops.read"],
    ["targets", "targets", "targets.manage"],
    ["plans", "plans", "plans.read"],
    ["settings", "settings", "organization.manage"],
    ["email", "email", "reports.email"],
    ["audit", "audit", "audit.read"],
    ["access", "access"],
    ["help", "help"],
  ];
  return (
    <>
      <header>
        <button
          className="brand"
          onClick={() => {
            if (principal) setSection("dashboard");
          }}
          aria-label={t("title")}
        >
          <img
            className="brand-mark"
            src="/brand/weg-white.svg"
            alt="WEG"
            width="56"
            height="40"
          />
          <span>{t("title")}</span>
        </button>
        <div className="header-actions">
          <select
            aria-label={t("language")}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="pt-BR">Português</option>
            <option value="en-US">English</option>
            <option value="es-ES">Español</option>
          </select>
          {principal && (
            <form
              action="/api/auth/logout"
              method="post"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await fetch("/api/auth/logout", {
                  method: "POST",
                  headers: { Accept: "application/json" },
                });
                if (r.ok) {
                  setPrincipal(null);
                  window.location.assign((await r.json()).url);
                }
              }}
            >
              <button>{t("logout")}</button>
            </form>
          )}
        </div>
      </header>
      {checking ? (
        <main>
          <p role="status">{t("loading")}</p>
        </main>
      ) : !principal ? (
        <main className="welcome">
          <section className="hero">
            <p className="eyebrow">{t("title")}</p>
            <h1>{t("tagline")}</h1>
            <p>{t("subtitle")}</p>
            <img
              className="motor"
              src="/brand/weg-motor-animation.webp"
              alt=""
              width="640"
              height="360"
            />
          </section>
          <section className="sign-in">
            <h2>{t("login")}</h2>
            <p>{t("accessHelp")}</p>
            {msg && <p role="alert">{t(msg)}</p>}
            <a className="button" href="/api/auth/login">
              {t("login")}
            </a>
            <button
              className="link"
              onClick={() =>
                setSection(section === "help" ? "dashboard" : "help")
              }
            >
              {t("help")}
            </button>
            {section === "help" && <Help t={t} />}
            <p className="muted">{t("lastActivity")}</p>
          </section>
        </main>
      ) : (
        <>
          <nav aria-label={t("title")}>
            {nav
              .filter(([, , permission]) => !permission || can(permission))
              .map(([key, label]) => (
                <button
                  key={key}
                  className={section === key ? "active" : ""}
                  onClick={() => {
                    setSection(key);
                    setMsg("");
                  }}
                >
                  {t(label)}
                </button>
              ))}
          </nav>
          <main>
            <div className="page-title">
              <div>
                <p className="eyebrow">{principal.name}</p>
                <h1>{t(section)}</h1>
              </div>
              <button onClick={reload}>{t("refresh")}</button>
            </div>
            {msg && (
              <div
                className={
                  msg === "saved" || msg === "queued"
                    ? "notice success"
                    : "notice"
                }
                role="status"
              >
                {t(msg)}
              </div>
            )}
            <section className="filters card">
              <Select
                label={t("organization")}
                value={organizationId}
                onChange={setOrg}
                options={tree}
              />
              <Select
                label={t("unit")}
                value={unitId}
                onChange={setUnit}
                options={organization?.units || []}
              />
              <Select
                label={t("factory")}
                value={factoryId}
                onChange={setFactory}
                options={unit?.factories || []}
              />
              <Select
                label={t("area")}
                value={areaId}
                onChange={setArea}
                options={factory?.areas || []}
              />
              {!["settings", "access", "help"].includes(section) && (
                <>
                  <Select
                    label={t("stage")}
                    value={stageId}
                    onChange={setStage}
                    options={
                      area?.stages.map((v) => ({ ...v, name: display(v) })) ||
                      []
                    }
                    all={t("all")}
                  />
                  <Select
                    label={t("line")}
                    value={lineId}
                    onChange={setLine}
                    options={area?.lines || []}
                    all={t("all")}
                  />
                  <Select
                    label={t("shift")}
                    value={shiftId}
                    onChange={setShift}
                    options={unit?.shifts || []}
                    all={t("all")}
                  />
                  <Field label={t("from")}>
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label={t("to")}>
                    <input
                      type="date"
                      value={to}
                      min={from}
                      onChange={(e) => setTo(e.target.value)}
                      required
                    />
                  </Field>
                </>
              )}
            </section>
            {section === "help" ? (
              <Help t={t} />
            ) : section === "access" ? (
              <section className="card">
                <h2>{t("access")}</h2>
                <p>{t("accessHelp")}</p>
                <p>
                  {t("unit")}:{" "}
                  {principal.global
                    ? t("all")
                    : principal.scopes.join(", ") || "—"}
                </p>
              </section>
            ) : section === "settings" ? (
              <Settings
                t={t}
                tree={tree}
                unit={unit}
                area={area}
                run={run}
                refresh={refreshTree}
                global={principal.global}
                busy={busy}
              />
            ) : !area || !unit ? (
              <p className="notice">{t("noAccess")}</p>
            ) : section === "dashboard" ? (
              <Dashboard
                key={query + revision}
                query={query}
                t={t}
                locale={locale}
                can={can}
                run={run}
              />
            ) : section === "production" || section === "stops" ? (
              <Entries
                key={section + query + revision}
                stops={section === "stops"}
                t={t}
                query={query}
                area={area}
                unit={unit}
                can={can}
                busy={busy}
                run={run}
              />
            ) : section === "targets" ? (
              <Targets
                key={areaId + revision}
                area={area}
                unit={unit}
                t={t}
                run={run}
                busy={busy}
              />
            ) : section === "plans" ? (
              <PlanEditor
                key={areaId + revision}
                t={t}
                locale={locale}
                area={area}
                canEdit={can("plans.manage")}
                run={run}
                busy={busy}
              />
            ) : section === "email" ? (
              <Emails
                key={unitId + revision}
                t={t}
                unit={unit}
                query={query}
                run={run}
                busy={busy}
              />
            ) : section === "audit" ? (
              <Audit key={unitId + revision} unit={unit} t={t} />
            ) : null}
          </main>
        </>
      )}
      <footer>
        {t("title")} ·{" "}
        <button className="link" onClick={() => setSection("help")}>
          {t("help")}
        </button>
      </footer>
    </>
  );
}
function Help({ t }: { t: T }) {
  return (
    <section className="card help">
      {[1, 2, 3, 4, 5, 6].map((n, i) => (
        <details key={n} open={i === 0}>
          <summary>
            {t(
              [
                "startGuide",
                "productionGuide",
                "targetsGuide",
                "stopsGuide",
                "plansGuide",
                "supportGuide",
              ][i],
            )}
          </summary>
          <p>{t("guide" + n)}</p>
        </details>
      ))}
    </section>
  );
}
function Dashboard({
  query,
  t,
  locale,
  can,
  run,
}: {
  query: string;
  t: T;
  locale: Locale;
  can: (p: Permission) => boolean;
  run: (a: () => Promise<unknown>, s?: string) => void;
}) {
  const [data, setData] = useState<Summary | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    api<Summary>("summary?" + query)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [query]);
  if (error) return <p role="alert">{t(error)}</p>;
  if (!data) return <p>{t("loading")}</p>;
  return (
    <>
      <div className="stats">
        {[
          ["quantity", data.quantity],
          ["defects", data.defects],
          [
            "ppm",
            data.quantity
              ? Math.round((data.defects / data.quantity) * 1e6)
              : 0,
          ],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <span>{t(String(label))}</span>
            <strong>{Number(value).toLocaleString(locale)}</strong>
          </div>
        ))}
      </div>
      <section className="card">
        <div className="toolbar">
          <h2>{t("dashboard")}</h2>
          {can("reports.export") && (
            <a
              className="button secondary"
              href={"/api/backend/export?" + query}
            >
              {t("export")}
            </a>
          )}
        </div>
        <Chart rows={data.rows} t={t} locale={locale} />
        {!data.rows.length ? (
          <p>{t("empty")}</p>
        ) : (
          <div className="summary-list">
            {data.rows.map((r, i) => (
              <details key={i}>
                <summary>
                  <span>
                    {r.date} · {r.line} · {r.stage} · {r.shift}
                  </span>
                  <strong>{r.quantity.toLocaleString(locale)}</strong>
                </summary>
                <div className="data-grid">
                  {[
                    ["defects", r.defects],
                    ["capacity", r.capacity],
                    ["target", r.metrics.target],
                    [
                      "efficiency",
                      r.metrics.efficiency == null
                        ? "—"
                        : r.metrics.efficiency.toFixed(1) + "%",
                    ],
                    ["ppm", r.metrics.ppm],
                  ].map(([key, value]) => (
                    <p key={key}>
                      <span>{t(String(key))}</span>
                      <b>{value ?? "—"}</b>
                    </p>
                  ))}
                </div>
                {r.mixedTargets && (
                  <p className="notice">{t("mixedTargets")}</p>
                )}
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
function Entries({
  stops,
  t,
  query,
  area,
  unit,
  can,
  busy,
  run,
}: {
  stops: boolean;
  t: T;
  query: string;
  area: Area;
  unit: Unit;
  can: (p: Permission) => boolean;
  busy: boolean;
  run: (a: () => Promise<unknown>) => void;
}) {
  const [page, setPage] = useState(1),
    [size, setSize] = useState(30),
    [data, setData] = useState<Page<RecordRow> | null>(null),
    [error, setError] = useState(""),
    [editing, setEditing] = useState<RecordRow | null>(null),
    [show, setShow] = useState(false);
  const path = stops ? "stops" : "production";
  useEffect(() => {
    api<Page<RecordRow>>(path + "?" + query + `&page=${page}&pageSize=${size}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [path, query, page, size]);
  const editable =
    can(stops ? "stops.edit.any" : "production.edit.any") ||
    can(stops ? "stops.edit.own" : "production.edit.own");
  return (
    <section className="card">
      <div className="toolbar">
        <h2>{t(path)}</h2>
        {can(stops ? "stops.create" : "production.create") && (
          <button
            onClick={() => {
              setEditing(null);
              setShow(true);
            }}
          >
            {t("new")}
          </button>
        )}
      </div>
      {stops && <p className="muted">{t("stopHelp")}</p>}
      {show && (
        <EntryForm
          key={editing?.id || "new"}
          stops={stops}
          t={t}
          area={area}
          unit={unit}
          editing={editing}
          busy={busy}
          onCancel={() => setShow(false)}
          onSave={(b) =>
            run(async () => {
              await api(
                path + (editing ? "/" + editing.id : ""),
                editing ? "PUT" : "POST",
                b,
              );
              setShow(false);
            })
          }
        />
      )}{" "}
      {error && <p role="alert">{t(error)}</p>}
      <div className="entry-list">
        {data?.items.map((r) => (
          <details key={r.id}>
            <summary>
              <span>
                {datePart(r.operationDate)} ·{" "}
                {r.lineStage?.line.name || r.equipment?.line.name} ·{" "}
                {r.lineStage?.stage.name || r.equipment?.name} · {r.shift.name}
              </span>
              <strong>{stops ? r.durationMinutes + " min" : r.quantity}</strong>
            </summary>
            <div className="data-grid">
              {stops ? (
                <>
                  <p>
                    <span>{t("reason")}</span>
                    <b>{r.reason?.name}</b>
                  </p>
                  <p>
                    <span>{t("comment")}</span>
                    <b>{r.comment || "—"}</b>
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <span>{t("defects")}</span>
                    <b>{r.defects}</b>
                  </p>
                  <p>
                    <span>{t("ppm")}</span>
                    <b>{r.metrics?.ppm}</b>
                  </p>
                  <p>
                    <span>{t("recovery")}</span>
                    <b>{r.recovery ? "✓" : "—"}</b>
                  </p>
                </>
              )}
              <p>
                <span>{t("actor")}</span>
                <b>{r.actor.displayName}</b>
              </p>
              <p>
                <span>{t("version")}</span>
                <b>{r.version}</b>
              </p>
            </div>
            {editable && (
              <button
                onClick={() => {
                  setEditing(r);
                  setShow(true);
                }}
              >
                {t("edit")}
              </button>
            )}
          </details>
        ))}
      </div>
      {data && !data.items.length && <p>{t("empty")}</p>}
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          {t("previous")}
        </button>
        <span>
          {t("page")} {page} /{" "}
          {Math.max(1, Math.ceil((data?.total || 0) / size))}
        </span>
        <button
          disabled={page * size >= (data?.total || 0)}
          onClick={() => setPage(page + 1)}
        >
          {t("next")}
        </button>
        <Field label={t("pageSize")}>
          <select
            value={size}
            onChange={(e) => {
              setSize(+e.target.value);
              setPage(1);
            }}
          >
            {[10, 30, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </Field>
      </div>
    </section>
  );
}
function EntryForm({
  stops,
  t,
  area,
  unit,
  editing,
  busy,
  onSave,
  onCancel,
}: {
  stops: boolean;
  t: T;
  area: Area;
  unit: Unit;
  editing: RecordRow | null;
  busy: boolean;
  onSave: (body: unknown) => void;
  onCancel: () => void;
}) {
  const [line, setLine] = useState(
      area.lines.find((l) =>
        stops
          ? l.equipment.some((e) => e.id === editing?.equipmentId)
          : l.stages.some((s) => s.id === editing?.lineStageId),
      )?.id ||
        area.lines[0]?.id ||
        "",
    ),
    [stage, setStage] = useState(editing?.lineStageId || ""),
    [equipment, setEquipment] = useState(editing?.equipmentId || ""),
    [shift, setShift] = useState(editing?.shiftId || unit.shifts[0]?.id || "");
  const current = area.lines.find((l) => l.id === line);
  const options =
    current?.stages.map((s) => ({
      id: s.id,
      name: area.stages.find((a) => a.id === s.stageId)?.name || s.stageId,
    })) || [];
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      operationDate = String(f.get("date")),
      body = {
        operationDate,
        shiftId: shift,
        ...(editing ? { version: editing.version } : {}),
      };
    if (stops) {
      const start = String(f.get("startedAt") || ""),
        end = String(f.get("endedAt") || "");
      onSave({
        ...body,
        equipmentId: equipment,
        reasonId: f.get("reason"),
        comment: f.get("comment"),
        durationMinutes: Number(f.get("duration")),
        startedAt: start || null,
        endedAt: end || null,
      });
    } else
      onSave({
        ...body,
        lineStageId: stage,
        quantity: Number(f.get("quantity")),
        defects: Number(f.get("defects")),
        recovery: f.get("recovery") === "on",
      });
  }
  return (
    <form className="editor" onSubmit={submit}>
      <div className="form-grid">
        <Field label={t("date")}>
          <input
            type="date"
            name="date"
            defaultValue={editing ? datePart(editing.operationDate) : today()}
            readOnly={!!editing}
            required
          />
        </Field>
        <Select
          label={t("line")}
          value={line}
          disabled={!!editing}
          onChange={(v) => {
            setLine(v);
            setStage("");
            setEquipment("");
          }}
          options={area.lines}
        />
        {stops ? (
          <>
            <Select
              label={t("equipment")}
              value={equipment}
              onChange={setEquipment}
              options={current?.equipment || []}
              disabled={!!editing}
            />
            <Field label={t("reason")}>
              <select
                name="reason"
                defaultValue={editing?.reasonId || ""}
                required
              >
                <option value="" disabled>
                  —
                </option>
                {unit.reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <Select
            label={t("stage")}
            value={stage}
            onChange={setStage}
            options={options}
            disabled={!!editing}
          />
        )}
        <Select
          label={t("shift")}
          value={shift}
          onChange={setShift}
          options={unit.shifts}
          disabled={!!editing}
        />
        {stops ? (
          <>
            <Field label={t("duration")}>
              <input
                type="number"
                name="duration"
                min="1"
                max="1440"
                defaultValue={editing?.durationMinutes || ""}
                required
              />
            </Field>
            <Field label={t("comment")}>
              <input
                name="comment"
                maxLength={500}
                defaultValue={editing?.comment || ""}
              />
            </Field>
            <Field label={t("startedAt") + " · " + t("optional")}>
              <input
                name="startedAt"
                placeholder="2026-11-22T10:00:00-03:00"
                defaultValue={editing?.startedAt || ""}
              />
            </Field>
            <Field label={t("endedAt") + " · " + t("optional")}>
              <input
                name="endedAt"
                placeholder="2026-11-22T10:30:00-03:00"
                defaultValue={editing?.endedAt || ""}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label={t("quantity")}>
              <input
                type="number"
                name="quantity"
                min="0"
                max="1000000000"
                defaultValue={editing?.quantity ?? ""}
                required
              />
            </Field>
            <Field label={t("defects")}>
              <input
                type="number"
                name="defects"
                min="0"
                defaultValue={editing?.defects ?? 0}
                required
              />
            </Field>
            <label className="check">
              <input
                name="recovery"
                type="checkbox"
                defaultChecked={editing?.recovery || false}
              />
              {t("recovery")}
            </label>
          </>
        )}
      </div>
      <div className="toolbar">
        <button disabled={busy}>{t("save")}</button>
        <button type="button" className="secondary" onClick={onCancel}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
function Targets({
  area,
  unit,
  t,
  run,
  busy,
}: {
  area: Area;
  unit: Unit;
  t: T;
  run: (a: () => Promise<unknown>) => void;
  busy: boolean;
}) {
  const [date, setDate] = useState(today()),
    [schedules, setSchedules] = useState<Target[]>([]),
    [lineStage, setLS] = useState(""),
    [shift, setShift] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    api<Target[]>("targets?" + new URLSearchParams({ areaId: area.id, date }))
      .then(setSchedules)
      .catch((e) => setError(e.message));
  }, [date, area.id]);
  const options = area.lines.flatMap((l) =>
      l.stages.map((s) => ({
        id: s.id,
        name:
          l.name +
          " · " +
          (area.stages.find((a) => a.id === s.stageId)?.name || ""),
      })),
    ),
    schedule = schedules.find(
      (s) => s.lineStageId === lineStage && s.shiftId === shift,
    ),
    v = schedule?.versions[0];
  return (
    <section className="card">
      <h2>{t("targets")}</h2>
      <p>{t("targetHelp")}</p>
      {error && <p role="alert">{t(error)}</p>}
      <div className="form-grid">
        <Field label={t("effectiveFrom")}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Select
          label={t("lineStage")}
          value={lineStage}
          onChange={setLS}
          options={options}
        />
        <Select
          label={t("shift")}
          value={shift}
          onChange={setShift}
          options={unit.shifts}
        />
      </div>
      {lineStage && shift && (
        <form
          key={lineStage + shift + (v?.id || "") + date}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() =>
              api("targets", "POST", {
                lineStageId: lineStage,
                shiftId: shift,
                effectiveFrom: date,
                enabled: f.get("enabled") === "on",
                capacity: numeric(String(f.get("capacity"))),
                efficiencyPercent: numeric(String(f.get("rate"))),
                quantityTarget: numeric(String(f.get("target"))),
                expectedRevision: schedule?.revision || 0,
              }),
            );
          }}
        >
          <div className="form-grid">
            <Field label={t("capacity")}>
              <input
                name="capacity"
                type="number"
                min="0"
                defaultValue={v?.capacity ?? ""}
              />
            </Field>
            <Field label={t("rate")}>
              <input
                name="rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                defaultValue={v?.efficiencyPercent ?? ""}
              />
            </Field>
            <Field label={t("target") + " · " + t("optional")}>
              <input
                name="target"
                type="number"
                min="0"
                defaultValue={v?.quantityTarget ?? ""}
              />
            </Field>
            <label className="check">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={v?.enabled ?? true}
              />
              {t("enabled")}
            </label>
          </div>
          <button disabled={busy}>{t("save")}</button>
          <p className="muted">
            {t("version")}: {schedule?.revision || 0}
          </p>
        </form>
      )}
    </section>
  );
}
function Settings({
  t,
  tree,
  unit,
  area,
  run,
  refresh,
  global,
  busy,
}: {
  t: T;
  tree: Organization[];
  unit?: Unit;
  area?: Area;
  run: (a: () => Promise<unknown>) => void;
  refresh: () => Promise<unknown>;
  global: boolean;
  busy: boolean;
}) {
  const [kind, setKind] = useState("organization"),
    [parent, setParent] = useState(""),
    [stage, setStage] = useState(""),
    [line, setLine] = useState("");
  const units = tree.flatMap((o) => o.units),
    factories = units.flatMap((u) => u.factories),
    areas = factories.flatMap((f) => f.areas),
    lines = areas.flatMap((a) => a.lines),
    stages = areas.flatMap((a) => a.stages);
  const parents =
    kind === "unit"
      ? tree
      : kind === "factory" || kind === "shift" || kind === "reason"
        ? units
        : kind === "area"
          ? factories
          : kind === "line" || kind === "stage"
            ? areas
            : kind === "equipment"
              ? lines
              : kind === "calendar"
                ? units.flatMap((u) => u.shifts)
                : [];
  const kinds = [
    "organization",
    "unit",
    "factory",
    "area",
    "line",
    "stage",
    "lineStage",
    "equipment",
    "shift",
    "calendar",
    "reason",
  ];
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      body: Record<string, unknown> = { kind };
    if (kind === "lineStage") {
      body.lineId = line;
      body.stageId = stage;
    } else if (kind === "calendar") {
      Object.assign(body, {
        shiftId: parent,
        weekday: Number(f.get("weekday")),
        anchorDate: f.get("anchorDate"),
        intervalWeeks: Number(f.get("intervalWeeks")),
        enabled: f.get("enabled") === "on",
        startMinute: numeric(String(f.get("startMinute"))),
        endMinute: numeric(String(f.get("endMinute"))),
      });
    } else {
      Object.assign(body, { code: f.get("code"), name: f.get("name") });
      if (kind !== "organization") body.parentId = parent;
      if (kind === "unit")
        Object.assign(body, {
          accessKey: f.get("accessKey"),
          timeZone: f.get("timeZone"),
        });
      if (kind === "shift")
        Object.assign(body, {
          startMinute: Number(f.get("startMinute")),
          endMinute: Number(f.get("endMinute")),
        });
      if (kind === "equipment")
        Object.assign(body, {
          workCenter: f.get("workCenter"),
          assetCode: f.get("assetCode"),
        });
    }
    run(async () => {
      await api("resources", "POST", body);
      await refresh();
    });
  };
  return (
    <>
      <section className="card">
        <h2>{t("settings")}</h2>
        {global ? (
          <form onSubmit={submit}>
            <Select
              label={t("kind")}
              value={kind}
              onChange={(v) => {
                setKind(v);
                setParent("");
              }}
              options={kinds.map((id) => ({ id, name: t(id) }))}
            />
            <div className="form-grid">
              {kind !== "organization" && kind !== "lineStage" && (
                <Select
                  label={t("parent")}
                  value={parent}
                  onChange={setParent}
                  options={parents}
                />
              )}{" "}
              {kind === "lineStage" ? (
                <>
                  <Select
                    label={t("line")}
                    value={line}
                    onChange={setLine}
                    options={lines}
                  />
                  <Select
                    label={t("stage")}
                    value={stage}
                    onChange={setStage}
                    options={
                      stages.filter(
                        (s) =>
                          s.areaId === lines.find((l) => l.id === line)?.areaId,
                      ) as typeof stages
                    }
                  />
                </>
              ) : kind === "calendar" ? (
                <>
                  {["weekday", "intervalWeeks"].map((k) => (
                    <Field key={k} label={t(k)}>
                      <input
                        type="number"
                        name={k}
                        min="1"
                        max={k === "weekday" ? 7 : 52}
                        defaultValue={1}
                        required
                      />
                    </Field>
                  ))}
                  <Field label={t("anchorDate")}>
                    <input name="anchorDate" type="date" required />
                  </Field>
                  <label className="check">
                    <input name="enabled" type="checkbox" defaultChecked />
                    {t("enabled")}
                  </label>
                </>
              ) : (
                <>
                  {["code", "name"].map((k) => (
                    <Field key={k} label={t(k)}>
                      <input
                        name={k}
                        maxLength={k === "code" ? 50 : 160}
                        required
                      />
                    </Field>
                  ))}
                </>
              )}
              {(kind === "shift" || kind === "calendar") &&
                ["startMinute", "endMinute"].map((k) => (
                  <Field key={k} label={t(k)}>
                    <input
                      type="number"
                      name={k}
                      min="0"
                      max="1439"
                      required={kind === "shift"}
                    />
                  </Field>
                ))}
              {kind === "unit" && (
                <>
                  <Field label={t("accessKey")}>
                    <input name="accessKey" maxLength={100} required />
                  </Field>
                  <Field label={t("timeZone")}>
                    <input
                      name="timeZone"
                      defaultValue="America/Sao_Paulo"
                      required
                    />
                  </Field>
                </>
              )}
              {kind === "equipment" &&
                ["workCenter", "assetCode"].map((k) => (
                  <Field key={k} label={t(k)}>
                    <input name={k} />
                  </Field>
                ))}
            </div>
            <button disabled={busy}>{t("save")}</button>
          </form>
        ) : (
          <p>{t("accessHelp")}</p>
        )}
      </section>
      {area && unit && (
        <section className="card">
          <h2>{t("translation")}</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                [kind, id] = String(f.get("entity")).split("|");
              run(async () => {
                await api("translations", "PUT", {
                  kind,
                  id,
                  locale: f.get("locale"),
                  label: f.get("label"),
                });
                await refresh();
              });
            }}
          >
            <div className="form-grid">
              <Field label={t("name")}>
                <select name="entity" required>
                  {[
                    ...area.stages.map((s) => ({ ...s, key: "stage" })),
                    ...unit.reasons.map((s) => ({ ...s, key: "reason" })),
                  ].map((s) => (
                    <option key={s.id} value={s.key + "|" + s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("language")}>
                <select name="locale">
                  <option>pt-BR</option>
                  <option>en-US</option>
                  <option>es-ES</option>
                </select>
              </Field>
              <Field label={t("label")}>
                <input name="label" maxLength={160} required />
              </Field>
            </div>
            <button disabled={busy}>{t("save")}</button>
          </form>
        </section>
      )}
    </>
  );
}
function Emails({
  unit,
  query,
  t,
  run,
  busy,
}: {
  unit: Unit;
  query: string;
  t: T;
  run: (a: () => Promise<unknown>, s?: string) => void;
  busy: boolean;
}) {
  const [list, setList] = useState<
      { id: string; address: string; locale: string; enabled: boolean }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<typeof list>("recipients?unitId=" + unit.id)
      .then(setList)
      .catch((e) => setError(e.message));
  }, [unit.id]);
  return (
    <section className="card">
      <h2>{t("email")}</h2>
      {error && <p>{t(error)}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          run(() =>
            api("recipients", "PUT", {
              unitId: unit.id,
              address: f.get("address"),
              locale: f.get("locale"),
              enabled: f.get("enabled") === "on",
            }),
          );
        }}
      >
        <div className="form-grid">
          <Field label={t("address")}>
            <input name="address" type="email" required />
          </Field>
          <Field label={t("language")}>
            <select name="locale">
              <option>pt-BR</option>
              <option>en-US</option>
              <option>es-ES</option>
            </select>
          </Field>
          <label className="check">
            <input type="checkbox" name="enabled" defaultChecked />
            {t("enabled")}
          </label>
        </div>
        <button disabled={busy}>{t("save")}</button>
      </form>
      <ul>
        {list.map((r) => (
          <li key={r.id}>
            {r.address} · {r.locale} · {r.enabled ? "✓" : "—"}
          </li>
        ))}
      </ul>
      <button
        disabled={busy}
        onClick={() => run(() => api("reports?" + query, "POST", {}), "queued")}
      >
        {t("queueReport")}
      </button>
    </section>
  );
}
function Audit({ unit, t }: { unit: Unit; t: T }) {
  const [page, setPage] = useState(1),
    [rows, setRows] = useState<
      {
        id: string;
        occurredAt: string;
        entityType: string;
        entityId: string;
        action: string;
        actor: { displayName: string };
      }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    api<typeof rows>("audit?unitId=" + unit.id + "&page=" + page)
      .then(setRows)
      .catch((e) => setError(e.message));
  }, [page, unit.id]);
  return (
    <section className="card">
      <h2>{t("audit")}</h2>
      {error && <p>{t(error)}</p>}
      {rows.map((r) => (
        <details key={r.id}>
          <summary>
            {r.occurredAt.slice(0, 19).replace("T", " ")} ·{" "}
            {r.actor.displayName}
          </summary>
          <p>
            {r.entityType} · {r.action} · {r.entityId}
          </p>
        </details>
      ))}
      <div className="toolbar">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          {t("previous")}
        </button>
        <span>
          {t("page")} {page}
        </span>
        <button disabled={rows.length < 50} onClick={() => setPage(page + 1)}>
          {t("next")}
        </button>
      </div>
    </section>
  );
}
