import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { permissions } from "../../packages/contracts/dist/index.js";
const uid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
const stage = {
  id: uid(6),
  areaId: uid(4),
  code: "S1",
  name: "Bobinagem",
  translations: [],
};
const line = {
  id: uid(5),
  areaId: uid(4),
  code: "L1",
  name: "Linha 01",
  stages: [{ id: uid(7), lineId: uid(5), stageId: stage.id }],
  equipment: [
    { id: uid(8), lineId: uid(5), code: "E1", name: "Equipamento de teste" },
  ],
};
const shifts = [1, 2, 3].map((n) => ({
  id: uid(10 + n),
  code: String(n),
  name: n + "º turno",
  startMinute: 300,
  endMinute: 840,
  calendarRules: [],
}));
const reason = {
  id: uid(20),
  code: "R1",
  name: "Manutenção",
  translations: [],
};
const area = {
  id: uid(4),
  factoryId: uid(3),
  code: "A1",
  name: "Área de teste",
  stages: [stage],
  lines: [line],
};
const tree = [
  {
    id: uid(1),
    code: "O1",
    name: "Organização de teste",
    units: [
      {
        id: uid(2),
        organizationId: uid(1),
        code: "U1",
        name: "Unidade de teste",
        accessKey: "example-unit",
        timeZone: "America/Sao_Paulo",
        shifts,
        reasons: [reason],
        factories: [
          {
            id: uid(3),
            unitId: uid(2),
            code: "F1",
            name: "Fábrica de teste",
            areas: [area],
          },
        ],
      },
    ],
  },
];
const summaryRows = shifts.flatMap((s, i) =>
  ["2026-11-16", "2026-11-17"].map((date, n) => ({
    date,
    lineStageId: uid(7),
    line: line.name,
    stage: stage.name,
    shift: s.name,
    shiftId: s.id,
    quantity: 4200 - i * 750 + n * 100,
    defects: 10,
    capacity: 4602,
    rate: 91,
    mixedTargets: false,
    metrics: { ppm: 2381, efficiency: 91, target: 4188, achieved: true },
  })),
);
const production = {
  id: uid(30),
  operationDate: "2026-11-17T00:00:00Z",
  lineStageId: uid(7),
  lineStage: { line, stage },
  shiftId: shifts[0].id,
  shift: shifts[0],
  quantity: 4200,
  defects: 10,
  recovery: false,
  version: 1,
  actor: { displayName: "Pessoa de teste" },
  metrics: { ppm: 2381, efficiency: 91, target: 4188 },
};
const stop = {
  id: uid(31),
  operationDate: "2026-11-17T00:00:00Z",
  equipmentId: uid(8),
  equipment: { ...line.equipment[0], line },
  reasonId: reason.id,
  reason,
  shiftId: shifts[0].id,
  shift: shifts[0],
  durationMinutes: 60,
  comment: "Ocorrência de teste",
  version: 1,
  actor: { displayName: "Pessoa de teste" },
};
const days = ["2026-11-16", "2026-11-17"].map((date) => ({
  date,
  demand: 4000,
  forecast: 4500,
  actualOverride: null,
  actualReason: "",
  adjustment: 0,
  adjustmentReason: "",
  note: "",
  closed: false,
  recoveryOnly: false,
}));
const plan = {
  id: uid(40),
  currentRevision: 1,
  versions: [
    {
      id: uid(41),
      revision: 1,
      name: "Cenário de teste",
      stageId: stage.id,
      lineId: null,
      startDate: "2026-11-16",
      initialBacklog: 1000,
      quantityMode: "TOTAL",
      archived: false,
      note: "",
      days,
      actions: [],
      costs: {
        hourly: 10,
        premium: 2,
        charges: 1.7,
        dsm: 1.2,
        hours: 8,
        food: 20,
        people: 2,
        volume: 1000,
        dailyExtra: 100,
      },
    },
  ],
};
const projection = {
  rows: days.map((d, i) => ({
    ...d,
    actual: 4200,
    opening: -1000 + i * 200,
    closing: -800 + i * 200,
  })),
  current: -800,
  final: -600,
  zeroDate: null,
  cost: 100,
  complete: true,
  issues: [],
};
const principal = {
  issuer: "https://example.invalid",
  subject: "synthetic-user",
  name: "Pessoa de teste",
  roles: ["example-role"],
  groups: ["example-group"],
  scopes: ["example-unit"],
  permissions: [...permissions],
  global: true,
};
const port = Number(process.env.UI_PORT || 3300),
  base = "http://localhost:" + port;
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "apps/web",
    "--port",
    String(port),
  ],
  {
    stdio: ["ignore", "ignore", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
  },
);
let errors = "";
child.stderr.on("data", (b) => {
  errors += b.toString();
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(ready, true, errors);
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  for (const [width, height] of [
    [320, 800],
    [375, 812],
    [768, 1024],
    [1440, 900],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } }),
      page = await context.newPage(),
      pageErrors = [];
    page.setDefaultTimeout(10000);
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await context.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data;
      if (path === "/api/auth/session")
        data = { authenticated: true, principal };
      else if (path === "/api/auth/activity") data = { active: true };
      else if (path.endsWith("/tree")) data = tree;
      else if (path.endsWith("/summary"))
        data = { quantity: 24000, defects: 60, count: 6, rows: summaryRows };
      else if (path.endsWith("/production"))
        data = { items: [production], total: 1, page: 1, pageSize: 30 };
      else if (path.endsWith("/stops"))
        data = { items: [stop], total: 1, page: 1, pageSize: 30 };
      else if (path.endsWith("/targets"))
        data = [
          {
            id: uid(50),
            lineStageId: uid(7),
            shiftId: shifts[0].id,
            revision: 1,
            versions: [
              {
                id: uid(51),
                effectiveFrom: "2026-11-17",
                enabled: true,
                capacity: 4602,
                efficiencyPercent: "91",
                quantityTarget: null,
              },
            ],
          },
        ];
      else if (path.endsWith("/plans")) data = [plan];
      else if (path.endsWith("/projection")) data = projection;
      else if (path.endsWith("/revisions"))
        data = [
          {
            revision: 1,
            createdAt: "2026-11-17T12:00:00Z",
            actor: { displayName: "Pessoa de teste" },
          },
        ];
      else if (path.endsWith("/recipients") || path.endsWith("/audit"))
        data = [];
      else throw Error("Unexpected mocked request: " + path);
      await route.fulfill({ json: data });
    });
    await page.goto(base);
    await page
      .getByRole("heading", { name: "Evolução", exact: true })
      .waitFor();
    async function fitted(label) {
      await page.waitForTimeout(50);
      const measure = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
        fields: [...document.querySelectorAll("input,select,textarea")]
          .filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => parseFloat(getComputedStyle(e).fontSize)),
      }));
      assert.ok(
        measure.scroll <= measure.width,
        `${width}px ${label}: ${JSON.stringify(measure)}`,
      );
      assert.ok(
        measure.fields.every((n) => n >= 16),
        `${label}: small field font`,
      );
    }
    await fitted("dashboard");
    for (const name of [
      "Produção",
      "Paradas",
      "CAP e metas",
      "Zero Atraso",
      "Cadastros",
      "Relatórios por e-mail",
      "Auditoria",
      "Acessos",
      "Ajuda com o site",
    ]) {
      await page
        .getByRole("navigation")
        .getByRole("button", { name, exact: true })
        .click();
      await page
        .getByRole("heading", { name, exact: true, level: 1 })
        .waitFor();
      if (["Produção", "Paradas"].includes(name))
        await page.getByRole("button", { name: "Novo", exact: true }).click();
      if (name === "CAP e metas") {
        await page
          .getByLabel("Vincular linha e etapa", { exact: true })
          .selectOption(uid(7));
        await page
          .getByLabel("Turno", { exact: true })
          .last()
          .selectOption(shifts[0].id);
      }
      if (name === "Zero Atraso") {
        await page
          .getByLabel("Zero Atraso", { exact: true })
          .selectOption(plan.id);
        await page
          .getByText("Cenário de teste", { exact: true })
          .first()
          .waitFor({ state: "attached" });
      }
      await fitted(name);
    }
    await page
      .getByRole("button", { name: "Painel de produção", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Evolução", exact: true, level: 1 })
      .waitFor();
    await page.getByLabel("Idioma", { exact: true }).selectOption("en-US");
    await page
      .getByRole("heading", { name: "Progress", exact: true, level: 1 })
      .waitFor();
    await page.getByLabel("Language", { exact: true }).selectOption("es-ES");
    await page
      .getByRole("heading", { name: "Evolución", exact: true, level: 1 })
      .waitFor();
    assert.deepEqual(pageErrors, []);
    console.log(
      `Responsive views, forms, help/logo and languages passed: ${width}x${height}`,
    );
    await context.close();
  }
  const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    }),
    page = await context.newPage();
  await page.goto(base);
  await page
    .getByRole("link", { name: "Entrar com conta corporativa" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  console.log("Unauthenticated login rendered without horizontal overflow");
  await context.close();
} finally {
  if (browser) await browser.close();
  child.kill("SIGTERM");
}
