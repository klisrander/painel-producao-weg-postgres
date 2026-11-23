import { createClient } from "redis";
import { digest, random, seal, unseal, cookie } from "./security";
import * as oidc from "openid-client";
export const IDLE_MS = 15 * 60_000,
  ABSOLUTE_MS = 8 * 60 * 60_000;
type Tokens = {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
  idToken?: string;
};
type Session = { tokens: Tokens; created: number; last: number };
let redis: ReturnType<typeof createClient> | undefined;
export async function closeStore() {
  if (redis?.isOpen) await redis.quit();
  redis = undefined;
  oidcPromise = undefined;
}
export async function store() {
  if (!redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw Error("REDIS_URL required");
    if (process.env.NODE_ENV === "production" && !url.startsWith("rediss://"))
      throw Error("Redis TLS required");
    redis = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) =>
          retries > 3
            ? new Error("redis_unavailable")
            : Math.min(retries * 100, 1000),
      },
    });
    redis.on("error", () => console.error("session_store_unavailable"));
    try {
      await redis.connect();
    } catch (error) {
      redis = undefined;
      throw error;
    }
  }
  return redis;
}
let oidcPromise: Promise<oidc.Configuration> | undefined;
export function provider() {
  return (oidcPromise ??= (async () => {
    const issuer = process.env.OIDC_ISSUER,
      clientId = process.env.OIDC_CLIENT_ID,
      secret = process.env.OIDC_CLIENT_SECRET;
    if (!issuer || !clientId || !secret)
      throw Error("OIDC configuration required");
    const testHttp =
      process.env.NODE_ENV === "test" &&
      process.env.OIDC_ALLOW_HTTP_TEST === "true" &&
      ["127.0.0.1", "localhost"].includes(new URL(issuer).hostname);
    const c = await oidc.discovery(
      new URL(issuer),
      clientId,
      { token_endpoint_auth_method: "client_secret_basic" },
      oidc.ClientSecretBasic(secret),
      testHttp
        ? { execute: [oidc.allowInsecureRequests], timeout: 5 }
        : { timeout: 5 },
    );
    oidc.enableNonRepudiationChecks(c);
    return c;
  })().catch((error) => {
    oidcPromise = undefined;
    throw error;
  }));
}
export function sessionAlive(
  s: { created: number; last: number },
  now = Date.now(),
) {
  return (
    s.created <= now &&
    s.last <= now &&
    now - s.last < IDLE_MS &&
    now - s.created < ABSOLUTE_MS
  );
}
function sessionKey(sid: string) {
  return "panel:session:" + digest(sid);
}
export async function createSession(
  tokens: Tokens,
  identity?: { issuer: string; subject: string; sid?: string },
) {
  const sid = random(),
    now = Date.now(),
    r = await store();
  await r.hSet(sessionKey(sid), {
    tokens: await seal(
      tokens as unknown as Record<string, unknown>,
      ABSOLUTE_MS / 1000,
    ),
    created: String(now),
    last: String(now),
  });
  await r.expire(sessionKey(sid), IDLE_MS / 1000);
  if (identity) {
    for (const suffix of [
      "sub:" + identity.subject,
      ...(identity.sid ? ["sid:" + identity.sid] : []),
    ]) {
      const index = "panel:identity:" + digest(identity.issuer + "|" + suffix);
      await r.sAdd(index, sessionKey(sid));
      await r.expire(index, ABSOLUTE_MS / 1000);
    }
  }
  return sid;
}
export async function removeSession(req: Request) {
  const sid = cookie(req);
  if (sid) await (await store()).del(sessionKey(sid));
}
export async function getSession(
  req: Request,
  touch = false,
): Promise<Session | null> {
  const sid = cookie(req);
  if (!sid) return null;
  const r = await store(),
    key = sessionKey(sid),
    raw = await r.hGetAll(key);
  if (!raw.tokens) return null;
  const s = { created: Number(raw.created), last: Number(raw.last) };
  if (!sessionAlive(s)) {
    await r.del(key);
    return null;
  }
  if (touch) {
    const now = Date.now();
    const changed = await r.eval(
      `if redis.call('EXISTS',KEYS[1])==1 then redis.call('HSET',KEYS[1],'last',ARGV[1]); redis.call('EXPIRE',KEYS[1],ARGV[2]); return 1 else return 0 end`,
      {
        keys: [key],
        arguments: [
          String(now),
          String(
            Math.max(
              1,
              Math.ceil(
                Math.min(IDLE_MS, ABSOLUTE_MS - (now - s.created)) / 1000,
              ),
            ),
          ),
        ],
      },
    );
    if (!changed) return null;
    s.last = now;
  }
  let tokens: Tokens;
  try {
    tokens = await unseal<Tokens>(raw.tokens);
  } catch {
    await r.del(key);
    return null;
  }
  if (tokens.expiresAt < Date.now() + 30000) {
    if (!tokens.refreshToken) {
      await r.del(key);
      return null;
    }
    const lock = key + ":refresh",
      owner = random();
    if (!(await r.set(lock, owner, { NX: true, PX: 15000 }))) {
      // Another replica is refreshing. Read its result without replaying a rotated token.
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (!(await r.exists(lock))) {
          const next = await r.hGet(key, "tokens");
          if (!next) return null;
          tokens = await unseal<Tokens>(next);
          if (tokens.expiresAt < Date.now()) return null;
          return { ...s, tokens };
        }
      }
      throw Error("session_refresh_busy");
    }
    try {
      const current = await r.hGet(key, "tokens");
      if (!current) return null;
      tokens = await unseal<Tokens>(current);
      if (tokens.expiresAt < Date.now() + 30000) {
        const refreshed = await oidc.refreshTokenGrant(
          await provider(),
          tokens.refreshToken!,
        );
        tokens = {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || tokens.refreshToken,
          idToken: refreshed.id_token || tokens.idToken,
          expiresAt: Date.now() + (refreshed.expires_in || 60) * 1000,
        };
        await r.eval(
          `if redis.call('EXISTS',KEYS[1])==1 then redis.call('HSET',KEYS[1],'tokens',ARGV[1]); return 1 else return 0 end`,
          {
            keys: [key],
            arguments: [
              await seal(
                tokens as unknown as Record<string, unknown>,
                Math.max(
                  1,
                  Math.ceil((s.created + ABSOLUTE_MS - Date.now()) / 1000),
                ),
              ),
            ],
          },
        );
      }
    } catch {
      await r.del(key);
      return null;
    } finally {
      await r.eval(
        `if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end`,
        { keys: [lock], arguments: [owner] },
      );
    }
  }
  return { ...s, tokens };
}
