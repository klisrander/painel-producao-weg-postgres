import test from "node:test";
import assert from "node:assert/strict";
import { mockProvider } from "./mock-oidc.mjs";
import { GET as login } from "../app/api/auth/login/route";
import { GET as callback } from "../app/api/auth/callback/route";
import { POST as activity } from "../app/api/auth/activity/route";
import { random, digest } from "../lib/security";
import {
  createSession,
  getSession,
  closeStore,
  store,
  IDLE_MS,
} from "../lib/session";
import { POST as backchannel } from "../app/api/auth/backchannel/route";
const redis = process.env.TEST_REDIS_URL;
test(
  "OIDC code/PKCE/nonce/state, one-use flows and server-only sessions",
  { skip: !redis },
  async () => {
    Object.assign(process.env, {
      NODE_ENV: "test",
      REDIS_URL: redis,
      OIDC_ALLOW_HTTP_TEST: "true",
      APP_URL: "http://localhost:3000",
      OIDC_CLIENT_ID: "synthetic-client",
      OIDC_CLIENT_SECRET: "synthetic-test-only",
      SESSION_ENCRYPTION_KEY: random(),
    });
    const provider = await mockProvider();
    process.env.OIDC_ISSUER = provider.issuer;
    try {
      const response = await login(),
        url = response.headers.get("Location")!;
      assert.equal(
        new URL(url).searchParams.get("code_challenge_method"),
        "S256",
      );
      assert.equal(new URL(url).searchParams.get("scope"), "openid profile");
      const flow = response.headers.get("Set-Cookie")!.split(";")[0],
        returnUrl = provider.issue(url),
        request = new Request(returnUrl, { headers: { cookie: flow } }),
        accepted = await callback(request);
      assert.equal(accepted.headers.get("Location"), "http://localhost:3000/");
      const cookies = accepted.headers.getSetCookie();
      const sessionCookie = cookies
        .find((c) => c.startsWith("panel="))!
        .split(";")[0];
      assert.equal(sessionCookie.includes("synthetic-access-token"), false);
      assert.match(cookies.join(";"), /HttpOnly/);
      const s = await getSession(
        new Request("http://localhost:3000", {
          headers: { cookie: sessionCookie },
        }),
      );
      assert.equal(s?.tokens.accessToken, "synthetic-access-token");
      assert.equal(
        (await callback(request)).headers.get("Location"),
        "http://localhost:3000/?auth=failed",
      );
      const evil = await activity(
        new Request("http://localhost:3000/api/auth/activity", {
          method: "POST",
          headers: { cookie: sessionCookie, origin: "https://evil.invalid" },
        }),
      );
      assert.equal(evil.status, 403);
      const sessionId = sessionCookie.slice("panel=".length),
        key = "panel:session:" + digest(sessionId),
        r = await store();
      const before = await r.hGet(key, "last");
      await getSession(
        new Request("http://localhost:3000", {
          headers: { cookie: sessionCookie },
        }),
      );
      assert.equal(await r.hGet(key, "last"), before);
      await r.hSet(key, "last", String(Date.now() - IDLE_MS));
      assert.equal(
        await getSession(
          new Request("http://localhost:3000", {
            headers: { cookie: sessionCookie },
          }),
        ),
        null,
      );
      for (const overrides of [
        { nonce: "wrong" },
        { aud: "wrong" },
        { __wrongSignature: true },
      ]) {
        const next = await login(),
          location = next.headers.get("Location")!,
          binding = next.headers.get("Set-Cookie")!.split(";")[0];
        assert.equal(
          (
            await callback(
              new Request(provider.issue(location, overrides), {
                headers: { cookie: binding },
              }),
            )
          ).headers.get("Location"),
          "http://localhost:3000/?auth=failed",
        );
      }

      const rotating = await createSession({
        accessToken: "old-access",
        expiresAt: Date.now() - 1000,
        refreshToken: "synthetic-refresh-token",
      });
      const rotatingRequest = () =>
        new Request("http://localhost:3000", {
          headers: { cookie: "panel=" + rotating },
        });
      const results = await Promise.all(
        Array.from({ length: 6 }, () => getSession(rotatingRequest())),
      );
      assert.equal(provider.refreshExchanges, 1);
      assert.ok(
        results.every(
          (s) => s?.tokens.accessToken === "synthetic-refreshed-access",
        ),
      );
      const identitySession = await createSession(
        { accessToken: "valid-access", expiresAt: Date.now() + 300000 },
        {
          issuer: provider.issuer,
          subject: "synthetic-subject",
          sid: "synthetic-sid",
        },
      );
      const token = await provider.logoutToken();
      const logoutRequest = () =>
        new Request("http://localhost:3000/api/auth/backchannel", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ logout_token: token }),
        });
      assert.equal((await backchannel(logoutRequest())).status, 200);
      assert.equal(
        await getSession(
          new Request("http://localhost:3000", {
            headers: { cookie: "panel=" + identitySession },
          }),
        ),
        null,
      );
      assert.equal((await backchannel(logoutRequest())).status, 400);
    } finally {
      await closeStore();
      await provider.close();
    }
  },
);
