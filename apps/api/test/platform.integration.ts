import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { importLegacy } from "../../../scripts/v2/import-legacy.js";
import { createApp } from "../dist/main.js";
import { permissions } from "@panel/contracts";
import { deliverBatch } from "../dist/mail.js";
const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
test(
  "normalized database, corporate claims and operational API",
  { skip: !url },
  async (t) => {
    process.env.NODE_ENV = "test";
    const schema = "test_" + randomUUID().replaceAll("-", ""),
      connection = new pg.Client({ connectionString: url });
    await connection.connect();
    await connection.query(`CREATE SCHEMA "${schema}"`);
    await connection.query(`SET search_path TO "${schema}"`);
    const databaseUrl = new URL(url!);
    databaseUrl.searchParams.set("schema", schema);
    process.env.DATABASE_URL = databaseUrl.href;
    const db = new PrismaClient();
    const key = await generateKeyPair("RS256"),
      wrong = await generateKeyPair("RS256"),
      jwk = {
        ...(await exportJWK(key.publicKey)),
        kid: "test",
        alg: "RS256",
        use: "sig",
      };
    let issuer = "",
      active = true,
      introspectionStatus = 200;
    const jwks = createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url?.endsWith("/introspect")) {
        res.statusCode = introspectionStatus;
        res.end(JSON.stringify({ active }));
        return;
      }
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => jwks.listen(0, "127.0.0.1", resolve));
    issuer = "http://127.0.0.1:" + (jwks.address() as { port: number }).port;
    const config = {
      introspection: true,
      introspectionClientId: "synthetic-introspection",
      introspectionSecret: "synthetic-only",
      issuer,
      audience: "api-test",
      jwks: issuer + "/jwks",
      mapping: {
        clientId: "client",
        groupsClaim: "groups",
        scopeClaim: "units",
        grants: [
          {
            role: "admin",
            groups: ["approved"],
            permissions: [...permissions],
            global: true,
          },
          {
            role: "reader",
            groups: ["approved"],
            permissions: [
              "production.read",
              "stops.read",
            ] as (typeof permissions)[number][],
            global: false,
          },
        ],
      },
      port: 0,
    };
    let app: Awaited<ReturnType<typeof createApp>> | undefined;
    try {
      await connection.query(
        await readFile(
          new URL(
            "../prisma/migrations/202611220001_normalized/migration.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      app = await createApp(config);
      await app.listen(0, "127.0.0.1");
      const base = await app.getUrl();
      const token = async (
        role = "admin",
        units = ["*"],
        override: Record<string, unknown> = {},
        bad = false,
      ) =>
        new SignJWT({
          realm_access: { roles: [role] },
          groups: ["approved"],
          units,
          ...override,
        })
          .setProtectedHeader({ alg: "RS256", kid: "test" })
          .setIssuer(String(override.iss || issuer))
          .setAudience(String(override.aud || "api-test"))
          .setSubject("subject-" + role)
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(bad ? wrong.privateKey : key.privateKey);
      const admin = await token();
      async function request(
        path: string,
        method = "GET",
        body?: unknown,
        bearer = admin,
      ) {
        const r = await fetch(base + "/" + path, {
          method,
          headers: {
            Authorization: "Bearer " + bearer,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: r.status, data: await r.json() };
      }
      async function resource(body: unknown) {
        const r = await request("resources", "POST", body);
        assert.equal(r.status, 201, JSON.stringify(r.data));
        return r.data;
      }
      await t.test(
        "rejects missing token, bad signatures, incorrect issuer/audience, and absent WBS groups",
        async () => {
          assert.equal((await fetch(base + "/me")).status, 401);
          assert.equal(
            (
              await request(
                "me",
                "GET",
                undefined,
                await token("admin", ["*"], {}, true),
              )
            ).status,
            401,
          );
          assert.equal(
            (
              await request(
                "me",
                "GET",
                undefined,
                await token("admin", ["*"], { aud: "other" }),
              )
            ).status,
            401,
          );
          assert.equal(
            (
              await request(
                "me",
                "GET",
                undefined,
                await token("admin", ["*"], { iss: "https://other.example" }),
              )
            ).status,
            401,
          );
          assert.equal(
            (
              await request(
                "production",
                "POST",
                {},
                await token("admin", ["*"], { groups: [] }),
              )
            ).status,
            403,
          );
          assert.equal((await fetch(base + "/health/live")).status, 200);
        },
      );
      await t.test(
        "revoked tokens are denied and identity-provider errors fail closed",
        async () => {
          active = false;
          assert.equal((await request("me")).status, 401);
          active = true;
          introspectionStatus = 503;
          assert.equal((await request("me")).status, 503);
          introspectionStatus = 200;
          assert.equal((await request("me")).status, 200);
        },
      );
      const org = await resource({
          kind: "organization",
          code: "ORG",
          name: "Synthetic organization",
        }),
        unit = await resource({
          kind: "unit",
          parentId: org.id,
          code: "U1",
          name: "Unit A",
          accessKey: "unit-a",
          timeZone: "America/Sao_Paulo",
        }),
        other = await resource({
          kind: "unit",
          parentId: org.id,
          code: "U2",
          name: "Unit B",
          accessKey: "unit-b",
          timeZone: "UTC",
        }),
        factory = await resource({
          kind: "factory",
          parentId: unit.id,
          code: "F1",
          name: "Factory",
        }),
        area = await resource({
          kind: "area",
          parentId: factory.id,
          code: "A1",
          name: "Area",
        }),
        line = await resource({
          kind: "line",
          parentId: area.id,
          code: "L1",
          name: "Line",
        }),
        stage = await resource({
          kind: "stage",
          parentId: area.id,
          code: "S1",
          name: "Stage",
        }),
        ls = await resource({
          kind: "lineStage",
          lineId: line.id,
          stageId: stage.id,
        }),
        shift = await resource({
          kind: "shift",
          parentId: unit.id,
          code: "1",
          name: "Shift 1",
          startMinute: 300,
          endMinute: 840,
        }),
        wrongShift = await resource({
          kind: "shift",
          parentId: other.id,
          code: "1",
          name: "Other shift",
          startMinute: 300,
          endMinute: 840,
        }),
        equipment = await resource({
          kind: "equipment",
          parentId: line.id,
          code: "E1",
          name: "Equipment",
        }),
        reason = await resource({
          kind: "reason",
          parentId: unit.id,
          code: "R1",
          name: "Maintenance",
        });
      const query = new URLSearchParams({
          areaId: area.id,
          from: "2026-11-16",
          to: "2026-11-18",
        }).toString(),
        reader = await token("reader", ["unit-a"]);
      await t.test(
        "unit scopes filter trees and reject cross-unit relationships at API and SQL levels",
        async () => {
          const tree = await request("tree", "GET", undefined, reader);
          assert.equal(tree.data[0].units.length, 1);
          assert.equal(tree.data[0].units[0].id, unit.id);
          assert.equal(
            (
              await request(
                "production?" + query,
                "GET",
                undefined,
                await token("reader", ["unit-b"]),
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await request("production", "POST", {
                operationDate: "2026-11-17",
                lineStageId: ls.id,
                shiftId: wrongShift.id,
                quantity: 1,
                defects: 0,
              })
            ).status,
            400,
          );
          const actor = await db.actor.findFirstOrThrow();
          await assert.rejects(() =>
            db.productionEntry.create({
              data: {
                operationDate: new Date("2026-11-17"),
                lineStageId: ls.id,
                shiftId: wrongShift.id,
                quantity: 1,
                defects: 0,
                actorId: actor.id,
              },
            }),
          );
        },
      );
      let record: { id: string; version: number };
      const target = {
        lineStageId: ls.id,
        shiftId: shift.id,
        effectiveFrom: "2026-11-17",
        enabled: true,
        capacity: 4602,
        efficiencyPercent: 91,
        expectedRevision: 0,
      };
      await t.test(
        "target versions are optimistic, immutable and do not rewrite saved production",
        async () => {
          const a = await request("targets", "POST", target);
          assert.equal(a.status, 201, JSON.stringify(a.data));
          const p = await request("production", "POST", {
            operationDate: "2026-11-17",
            lineStageId: ls.id,
            shiftId: shift.id,
            quantity: 3978,
            defects: 22,
          });
          assert.equal(p.status, 201, JSON.stringify(p.data));
          record = p.data;
          assert.equal(p.data.targetVersionId, a.data.id);
          const results = await Promise.all([
            request("targets", "POST", {
              ...target,
              capacity: 5000,
              expectedRevision: 1,
            }),
            request("targets", "POST", {
              ...target,
              capacity: 5100,
              expectedRevision: 1,
            }),
          ]);
          assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
          const stored = await db.productionEntry.findUniqueOrThrow({
            where: { id: record.id },
          });
          assert.equal(stored.targetVersionId, a.data.id);
          await assert.rejects(() =>
            db.targetVersion.update({
              where: { id: a.data.id },
              data: { capacity: 1 },
            }),
          );
          const h = await request("production?" + query);
          assert.equal(h.data.items[0].metrics.target, 4188);
          assert.equal(h.data.items[0].metrics.ppm, 5530);
        },
      );
      await t.test(
        "updates require permission and current revision; attribution and audit remain intact",
        async () => {
          const body = {
            operationDate: "2026-11-17",
            lineStageId: ls.id,
            shiftId: shift.id,
            quantity: 4000,
            defects: 20,
            version: record.version,
          };
          assert.equal(
            (await request("production/" + record.id, "PUT", body, reader))
              .status,
            403,
          );
          assert.equal(
            (await request("production/" + record.id, "PUT", body)).status,
            200,
          );
          assert.equal(
            (await request("production/" + record.id, "PUT", body)).status,
            409,
          );
          const audits = await db.auditEvent.findMany({
            where: { entityId: record.id },
          });
          assert.equal(audits.length, 2);
          await assert.rejects(() =>
            db.auditEvent.delete({ where: { id: audits[0].id } }),
          );
        },
      );
      await t.test(
        "legacy stop durations stay nullable in real times; impossible intervals are rejected",
        async () => {
          const s = await request("stops", "POST", {
            operationDate: "2026-11-17",
            equipmentId: equipment.id,
            reasonId: reason.id,
            shiftId: shift.id,
            durationMinutes: 60,
            comment: "Synthetic stop",
          });
          assert.equal(s.status, 201, JSON.stringify(s.data));
          assert.equal(s.data.startedAt, null);
          assert.equal(
            (
              await request("stops", "POST", {
                operationDate: "2026-11-17",
                equipmentId: equipment.id,
                reasonId: reason.id,
                shiftId: shift.id,
                durationMinutes: 1,
                startedAt: "2026-11-17T10:00:00Z",
                endedAt: "2026-11-17T11:00:00Z",
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "plans normalize days/actions/costs, preserve revisions and calculate actuals",
        async () => {
          const body = {
            name: "Recovery",
            stageId: stage.id,
            startDate: "2026-11-17",
            initialBacklog: 100,
            quantityMode: "TOTAL",
            archived: false,
            note: "",
            expectedRevision: 0,
            days: [
              {
                date: "2026-11-17",
                demand: 3900,
                forecast: 1,
                actualOverride: null,
                actualReason: "",
                adjustment: 0,
                adjustmentReason: "",
                note: "",
                closed: false,
                recoveryOnly: false,
              },
            ],
            actions: [],
            costs: {
              hourly: 0,
              premium: 2,
              charges: 1.7,
              dsm: 1.2,
              hours: 8,
              food: 0,
              people: 0,
              volume: 0,
              dailyExtra: 0,
            },
          };
          const p = await request("plans?areaId=" + area.id, "POST", body);
          assert.equal(p.status, 201, JSON.stringify(p.data));
          const projection = await request(
            "plans/" + p.data.id + "/projection",
          );
          assert.equal(projection.data.final, 0);
          const changed = await request(
            "plans/" + p.data.id + "?areaId=" + area.id,
            "PUT",
            { ...body, name: "Changed", expectedRevision: 1 },
          );
          assert.equal(changed.status, 200);
          assert.equal(
            await db.recoveryPlanVersion.count({
              where: { planId: p.data.id },
            }),
            2,
          );
          assert.equal(await db.planDay.count(), 2);
          assert.equal(
            (
              await request(
                "plans/" + p.data.id + "?areaId=" + area.id,
                "PUT",
                { ...body, expectedRevision: 1 },
              )
            ).status,
            409,
          );
        },
      );
      await t.test(
        "corporate report queue checks domains and concurrent workers claim once",
        async () => {
          process.env.MAIL_ENABLED = "true";
          process.env.MAIL_ALLOWED_DOMAINS = "example.invalid";
          process.env.MAIL_FROM = "reports@example.invalid";
          assert.equal(
            (
              await request("recipients", "PUT", {
                unitId: unit.id,
                address: "bad@other.invalid",
                locale: "pt-BR",
                enabled: true,
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("recipients", "PUT", {
                unitId: unit.id,
                address: "test@example.invalid",
                locale: "en-US",
                enabled: true,
              })
            ).status,
            200,
          );
          assert.equal(
            (await request("reports?" + query, "POST", {})).data.queued,
            1,
          );
          let sends = 0;
          await Promise.all([
            deliverBatch(db, async () => {
              sends++;
            }),
            deliverBatch(db, async () => {
              sends++;
            }),
          ]);
          assert.equal(sends, 1);
          assert.equal(
            await db.mailOutbox.count({ where: { status: "SENT" } }),
            1,
          );
        },
      );

      await t.test(
        "private legacy migration simulates, imports idempotently, preserves target snapshots and rejects changed sources",
        async () => {
          const mapping = {
            source: "synthetic-import",
            sections: {
              sample: {
                areaId: area.id,
                timeZone: "America/Sao_Paulo",
                shifts: { "1": shift.id, "2": shift.id, "3": shift.id },
                lines: { Line: line.id },
                stages: { Stage: stage.id },
                equipment: { Equipment: equipment.id },
                reasons: { Maintenance: reason.id },
              },
            },
            baselineTargets: [],
          };
          const backup = {
            users: [
              {
                id: 90,
                name: "Legacy author",
                password: "never-import",
                role: "admin",
                general_admin: 1,
              },
            ],
            records: [
              {
                id: 90,
                section: "sample",
                kind: "producao",
                owner: 90,
                created: "2026-11-16T12:00:00Z",
                updated: "2026-11-16T12:00:00Z",
                data: JSON.stringify({
                  data: "2026-11-16",
                  linha: "Line",
                  etapa: "Stage",
                  turno: "1",
                  producao: 10,
                  defeitos: 1,
                  meta: 20,
                }),
              },
            ],
            goal_changes: [
              {
                id: 90,
                section: "sample",
                effective_date: "2026-11-16",
                line: "Line",
                stage: "Stage",
                meta1: 20,
                meta2: 20,
                meta3: 20,
                third_enabled: 1,
                at: "2026-11-16T12:00:00Z",
                actor: "Legacy author",
              },
            ],
            performance_changes: [],
            projection_plans: [
              {
                id: "legacy-plan",
                section: "sample",
                name: "Legacy scenario",
                stage: "Stage",
                start_date: "2026-11-16",
                initial_backlog: 100,
                revision: 1,
                actor: "Legacy author",
                created: "2026-11-16T12:00:00Z",
                data: JSON.stringify({
                  line: "Line",
                  quantity_mode: "total",
                  rows: [
                    {
                      date: "2026-11-16",
                      demand: 20,
                      forecast: 20,
                      actual: null,
                      adjustment: 0,
                    },
                  ],
                  actions: [
                    {
                      title: "Excluded action",
                      kind: "HE",
                      status: "Planejada",
                      include: false,
                      schedule: "todos",
                      start: "2026-11-16",
                      end: "2026-11-16",
                      extra_units: 100,
                      daily_cost: 10,
                    },
                  ],
                  costs: {},
                }),
              },
            ],
            projection_revisions: [],
            audit: [
              {
                id: 90,
                section: "sample",
                actor: "Legacy author",
                action: "UPDATE",
                record_id: 90,
                at: "2026-11-16T12:00:00Z",
                before_data: '{"password":"never-import","producao":9}',
                after_data: '{"password":"never-import","producao":10}',
              },
            ],
          };
          const before = await db.productionEntry.count();
          assert.equal((await importLegacy(db, backup, mapping)).dryRun, true);
          assert.equal(await db.productionEntry.count(), before);
          await importLegacy(db, backup, mapping, true);
          await importLegacy(db, backup, mapping, true);
          assert.equal(await db.productionEntry.count(), before + 1);
          const ref = await db.legacyReference.findUniqueOrThrow({
            where: {
              source_entityType_sourceId: {
                source: "synthetic-import",
                entityType: "production",
                sourceId: "90",
              },
            },
          });
          const imported = await db.productionEntry.findUniqueOrThrow({
            where: { id: ref.targetId },
            include: { actor: true, targetVersion: true },
          });
          assert.equal(imported.actor.issuer, "urn:legacy:synthetic-import");
          assert.equal(imported.targetVersion?.kind, "SNAPSHOT");
          assert.equal(imported.targetVersion?.quantityTarget, 20);
          const audit = await db.auditEvent.findFirstOrThrow({
            where: { entityType: "legacy-record" },
          });
          assert.equal(JSON.stringify(audit).includes("never-import"), false);
          const importedAction = await db.recoveryAction.findFirstOrThrow({
            where: { title: "Excluded action" },
          });
          assert.equal(importedAction.status, "PLANNED");
          assert.equal(importedAction.included, false);
          const mismatch = structuredClone(backup);
          mismatch.records[0].data = JSON.stringify({
            data: "2026-11-16",
            linha: "Line",
            etapa: "Stage",
            turno: "1",
            producao: 10,
            defeitos: 1,
            capacity: 250,
            efficiency_target: 64.4,
            meta: 162,
          });
          await assert.rejects(
            () => importLegacy(db, mismatch, mapping),
            /legacy_target_mismatch/,
          );
          const changed = structuredClone(backup);
          changed.records[0].data = changed.records[0].data.replace(
            '"producao":10',
            '"producao":11',
          );
          await assert.rejects(
            () => importLegacy(db, changed, mapping, true),
            /legacy_source_changed/,
          );
        },
      );
      await t.test(
        "no password, local role, membership or administrator tables exist",
        async () => {
          const result = await connection.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema=$1",
            [schema],
          );
          const names = result.rows.map((r) => r.table_name);
          assert.equal(
            names.some((n) =>
              [
                "users",
                "sessions",
                "roles",
                "permissions",
                "User",
                "Role",
                "Membership",
              ].includes(n),
            ),
            false,
          );
          const columns = await connection.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='Actor'",
            [schema],
          );
          assert.deepEqual(
            columns.rows.map((r) => r.column_name).sort(),
            ["id", "issuer", "subject", "displayName"].sort(),
          );
        },
      );
    } finally {
      if (app) await app.close();
      await db.$disconnect();
      await new Promise<void>((resolve) => jwks.close(() => resolve()));
      await connection.query(`DROP SCHEMA "${schema}" CASCADE`);
      await connection.end();
    }
  },
);
