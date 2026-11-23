import test from "node:test";
import assert from "node:assert/strict";
import { mappingSchema, principalFromClaims, inUnit } from "../src/policy.js";
import { productionInput, stopInput, planInput } from "../src/input.js";
import { metrics, project, csv, workbook } from "@panel/domain";
import { shiftWindow } from "../dist/service.js";
const mapping = mappingSchema.parse({
  clientId: "test-client",
  groupsClaim: "groups",
  scopeClaim: "units",
  grants: [
    { role: "editor", groups: ["approved"], permissions: ["production.read"] },
    {
      role: "administrator",
      groups: ["approved", "admin-approved"],
      permissions: ["organization.manage"],
      global: true,
    },
  ],
});
const claims = {
  iss: "https://issuer.example",
  sub: "test-user",
  realm_access: { roles: ["editor", "administrator"] },
  groups: ["approved"],
  units: ["unit-a", "*"],
};
test("roles AND all groups are required; wildcard alone cannot grant global access", () => {
  const p = principalFromClaims(claims, mapping);
  assert.deepEqual(p.permissions, ["production.read"]);
  assert.equal(p.global, false);
  assert.equal(inUnit(p, "unit-a"), true);
  assert.equal(inUnit(p, "unit-b"), false);
  const admin = principalFromClaims(
    { ...claims, groups: ["approved", "admin-approved"] },
    mapping,
  );
  assert.equal(admin.global, true);
  assert.equal(inUnit(admin, "unit-b"), true);
  assert.deepEqual(
    principalFromClaims({ ...claims, groups: [] }, mapping).permissions,
    [],
  );
});
test("malformed claims and unknown permissions fail closed", () => {
  assert.throws(() => principalFromClaims({}, mapping));
  assert.deepEqual(
    principalFromClaims({ ...claims, groups: "approved" }, mapping).permissions,
    [],
  );
  assert.equal(
    mappingSchema.safeParse({
      ...mapping,
      grants: [{ role: "x", groups: ["x"], permissions: ["admin.everything"] }],
    }).success,
    false,
  );
});
test("efficiency uses actual capacity and preserves unknown versus zero", () => {
  assert.equal(metrics(4464, 14, 4498, 91).efficiency, (4464 / 4498) * 100);
  assert.equal(metrics(0, 0, null, null).target, null);
  assert.equal(metrics(0, 0, 0, 91).target, 0);
  assert.equal(metrics(2460, 10, 2667, 91).target, 2427);
  assert.equal(metrics(2460, 10, 2667, 91).ppm, 4065);
});
const day = (date: string, forecast: number | null, demand: number | null) => ({
  date,
  forecast,
  demand,
  actualOverride: null,
  actualReason: "",
  adjustment: 0,
  adjustmentReason: "",
  note: "",
  closed: false,
  recoveryOnly: false,
});
test("projection uses actual in past and forecast while today is open", () => {
  const days = [day("2026-11-16", 100, 100), day("2026-11-17", 300, 100)];
  const result = project(200, days, [], "2026-11-17", {
    "2026-11-16": {
      quantity: 200,
      defects: 0,
      recovery: 0,
      recoveryDefects: 0,
    },
    "2026-11-17": { quantity: 1, defects: 0, recovery: 0, recoveryDefects: 0 },
  });
  assert.equal(result.current, -100);
  assert.equal(result.final, 100);
  assert.equal(result.zeroDate, "2026-11-17");
  assert.equal(
    project(
      200,
      [...days.slice(0, 1), { ...days[1], closed: true }],
      [],
      "2026-11-17",
      {
        "2026-11-16": {
          quantity: 200,
          defects: 0,
          recovery: 0,
          recoveryDefects: 0,
        },
        "2026-11-17": {
          quantity: 1,
          defects: 0,
          recovery: 0,
          recoveryDefects: 0,
        },
      },
    ).final,
    -199,
  );
});
test("missing actual keeps later balances unknown; extra Saturday recovers without extra demand", () => {
  assert.equal(
    project(
      100,
      [day("2026-11-16", 10, 10), day("2026-11-17", 200, 0)],
      [],
      "2026-11-17",
    ).final,
    null,
  );
  const p = project(
    100,
    [day("2026-11-13", 0, 0), day("2026-11-16", 0, 0)],
    [],
    "2026-11-17",
    {
      "2026-11-13": {
        quantity: 0,
        defects: 0,
        recovery: 0,
        recoveryDefects: 0,
      },
      "2026-11-14": {
        quantity: 120,
        defects: 10,
        recovery: 120,
        recoveryDefects: 10,
      },
      "2026-11-16": {
        quantity: 0,
        defects: 0,
        recovery: 0,
        recoveryDefects: 0,
      },
    },
    true,
  );
  assert.equal(p.rows.length, 3);
  assert.equal(p.final, 10);
  assert.equal(p.zeroDate, "2026-11-14");
});
test("inputs reject impossible counts and unpaired or fabricated times", () => {
  const base = {
    operationDate: "2026-02-30",
    lineStageId: crypto.randomUUID(),
    shiftId: crypto.randomUUID(),
    quantity: 1,
    defects: 0,
  };
  assert.equal(productionInput.safeParse(base).success, false);
  assert.equal(
    productionInput.safeParse({
      ...base,
      operationDate: "2026-11-17",
      defects: 2,
    }).success,
    false,
  );
  const stop = {
    operationDate: "2026-11-17",
    equipmentId: crypto.randomUUID(),
    reasonId: crypto.randomUUID(),
    shiftId: crypto.randomUUID(),
    durationMinutes: 20,
  };
  assert.equal(stopInput.safeParse(stop).success, true);
  assert.equal(
    stopInput.safeParse({ ...stop, startedAt: "2026-11-17T10:00:00Z" }).success,
    false,
  );
  assert.equal(
    stopInput.safeParse({
      ...stop,
      startedAt: "2026-11-17T10:00:00Z",
      endedAt: "2026-11-17T11:00:00Z",
    }).success,
    false,
  );
});
test("CSV treats user text as text instead of spreadsheet formulas", () => {
  assert.match(csv([['=HYPERLINK("x")', "  +cmd", 12]]), /"'=HYPERLINK/);
});
test("overnight shifts and alternate Sundays respect the unit timezone", () => {
  const shift = {
    id: "x",
    unitId: "x",
    code: "3",
    name: "3",
    startMinute: 1320,
    endMinute: 300,
    calendarRules: [
      {
        id: "r",
        shiftId: "x",
        weekday: 7,
        anchorDate: new Date("2026-11-15T00:00Z"),
        intervalWeeks: 2,
        enabled: true,
        startMinute: null,
        endMinute: null,
      },
    ],
  };
  const w = shiftWindow("2026-11-15", shift, "America/Sao_Paulo");
  assert.equal(w?.from.toISO(), "2026-11-15T22:00:00.000-03:00");
  assert.equal(w?.to.toISO(), "2026-11-16T05:00:00.000-03:00");
  assert.equal(shiftWindow("2026-11-22", shift, "America/Sao_Paulo"), null);
  assert.notEqual(shiftWindow("2026-11-29", shift, "America/Sao_Paulo"), null);
});

test("Excel output contains worksheet relationships and a chart without executing user text", () => {
  const bytes = workbook(
    [
      {
        name: "Projection",
        rows: [
          ["Date", "Balance"],
          ["2026-11-17", -10],
          ["2026-11-18", null],
          ['=HYPERLINK("x")', 10],
        ],
      },
    ],
    { sheetIndex: 0, xColumn: 0, yColumn: 1, title: "Balance" },
  );
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /xl\/charts\/chart1.xml/);
  assert.match(text, /dispBlanksAs val="gap"/);
  assert.match(text, /t="inlineStr"/);
});

test("client role lookup treats client IDs containing dots as literal keys", () => {
  const map = mappingSchema.parse({
    clientId: "panel.production",
    groupsClaim: "groups",
    scopeClaim: "units",
    grants: [
      {
        role: "reader",
        groups: ["approved"],
        permissions: ["production.read"],
      },
    ],
  });
  const p = principalFromClaims(
    {
      iss: "https://issuer.example",
      sub: "u",
      resource_access: { "panel.production": { roles: ["reader"] } },
      groups: ["approved"],
      units: ["unit-a"],
    },
    map,
  );
  assert.deepEqual(p.permissions, ["production.read"]);
});
