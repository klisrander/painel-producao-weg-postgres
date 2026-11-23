import test from "node:test";
import assert from "node:assert/strict";
import {
  limitedBody,
  BodyTooLarge,
  random,
  seal,
  unseal,
  cookie,
  cookieHeader,
  sameOrigin,
} from "../lib/security";
import { sessionAlive, IDLE_MS, ABSOLUTE_MS } from "../lib/session";
import { dictionaries, pt } from "../lib/i18n";
test("encrypted session payload rejects tampering and never exposes plaintext", async () => {
  process.env.SESSION_ENCRYPTION_KEY = random();
  const value = await seal({ accessToken: "synthetic-sensitive-token" }, 60);
  assert.equal(value.includes("synthetic-sensitive-token"), false);
  assert.equal(
    (await unseal<{ accessToken: string }>(value)).accessToken,
    "synthetic-sensitive-token",
  );
  const parts = value.split(".");
  parts[3] = (parts[3][0] === "a" ? "b" : "a") + parts[3].slice(1);
  await assert.rejects(() => unseal(parts.join(".")));
});
test("opaque cookie and CSRF origin policy", () => {
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.APP_URL = "https://panel.example.invalid";
  const sid = random();
  assert.equal(
    cookie(
      new Request("https://panel.example.invalid", {
        headers: { cookie: "panel=" + sid },
      }),
    ),
    sid,
  );
  assert.equal(
    cookie(
      new Request("https://panel.example.invalid", {
        headers: { cookie: "panel=malformed" },
      }),
    ),
    null,
  );
  assert.equal(
    sameOrigin(
      new Request("https://panel.example.invalid", {
        headers: { origin: "https://evil.invalid" },
      }),
    ),
    false,
  );
  assert.equal(
    sameOrigin(
      new Request("https://panel.example.invalid", {
        headers: { origin: "https://panel.example.invalid" },
      }),
    ),
    true,
  );
  Object.assign(process.env, { NODE_ENV: "production" });
  assert.match(cookieHeader("__Host-panel", sid, 100), /Secure/);
  assert.match(cookieHeader("__Host-panel", sid, 100), /HttpOnly/);
  assert.doesNotMatch(cookieHeader("__Host-panel", sid, 100), /Domain=/);
  Object.assign(process.env, { NODE_ENV: "test" });
});
test("background reads cannot extend idle or absolute limits", () => {
  const now = Date.now();
  assert.equal(
    sessionAlive({ created: now - 1000, last: now - 1000 }, now),
    true,
  );
  assert.equal(
    sessionAlive({ created: now - 1000, last: now - IDLE_MS }, now),
    false,
  );
  assert.equal(
    sessionAlive({ created: now - ABSOLUTE_MS, last: now }, now),
    false,
  );
});
test("all UI dictionaries cover every key", () => {
  for (const dictionary of Object.values(dictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(pt).sort());
    for (const value of Object.values(dictionary))
      assert.equal(typeof value, "string");
  }
});

test("streamed requests enforce size limits before buffering the full body", async () => {
  const request = new Request("https://example.invalid", {
    method: "POST",
    body: "123456",
  });
  await assert.rejects(() => limitedBody(request, 5), BodyTooLarge);
  assert.equal(
    await limitedBody(
      new Request("https://example.invalid", { method: "POST", body: "12345" }),
      5,
    ),
    "12345",
  );
});
