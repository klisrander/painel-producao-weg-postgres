import { createRemoteJWKSet, jwtVerify } from "jose";
import { digest, limitedBody, BodyTooLarge } from "../../../../lib/security";
import { provider, store } from "../../../../lib/session";
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const body = await limitedBody(req, 32768);
    if (body.length > 32768) return new Response(null, { status: 413 });
    const value = new URLSearchParams(body).get("logout_token");
    if (!value) return new Response(null, { status: 400 });
    const config = await provider(),
      metadata = config.serverMetadata();
    if (!metadata.jwks_uri) throw Error();
    jwks ??= createRemoteJWKSet(new URL(metadata.jwks_uri));
    const { payload } = await jwtVerify(value, jwks, {
      issuer: metadata.issuer,
      audience: process.env.OIDC_CLIENT_ID,
      algorithms: ["RS256", "PS256", "ES256"],
      requiredClaims: ["iss", "aud", "iat", "jti"],
      maxTokenAge: "2m",
    });
    const events = payload.events as Record<string, unknown> | undefined;
    if (
      !events ||
      !events["http://schemas.openid.net/event/backchannel-logout"] ||
      "nonce" in payload ||
      (!payload.sid && !payload.sub) ||
      typeof payload.jti !== "string"
    )
      throw Error();
    const redis = await store();
    if (
      !(await redis.set(
        "panel:logout:" + digest(payload.iss! + "|" + payload.jti),
        "1",
        { NX: true, EX: 180 },
      ))
    )
      throw Error();
    const index =
      "panel:identity:" +
      digest(
        payload.iss! +
          "|" +
          (payload.sid ? "sid:" + payload.sid : "sub:" + payload.sub),
      );
    const sessions = await redis.sMembers(index);
    if (sessions.length) await redis.del(sessions);
    await redis.del(index);
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof BodyTooLarge)
      return new Response(null, { status: 413 });
    return new Response(null, { status: 400 });
  }
}
