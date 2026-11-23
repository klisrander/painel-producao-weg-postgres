import { NextResponse } from "next/server";
import * as oidc from "openid-client";
import { provider, store, createSession } from "../../../../lib/session";
import {
  digest,
  unseal,
  cookie,
  cookieHeader,
  cookieName,
  appOrigin,
} from "../../../../lib/security";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const res = NextResponse.redirect(appOrigin() + "/");
  res.headers.append("Set-Cookie", cookieHeader(cookieName() + "-flow", "", 0));
  try {
    const f = cookie(req, cookieName() + "-flow");
    if (!f) throw Error();
    const value = await (await store()).getDel("panel:flow:" + digest(f));
    if (!value) throw Error();
    const flow = await unseal<{
        state: string;
        nonce: string;
        verifier: string;
      }>(value),
      url = new URL(appOrigin() + "/api/auth/callback");
    url.search = new URL(req.url).search;
    const tokens = await oidc.authorizationCodeGrant(await provider(), url, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
    const sid = await createSession(
      {
        accessToken: tokens.access_token,
        expiresAt: Date.now() + (tokens.expires_in || 60) * 1000,
        refreshToken: tokens.refresh_token,
        idToken: tokens.id_token,
      },
      {
        issuer: tokens.claims()!.iss,
        subject: tokens.claims()!.sub,
        sid:
          typeof tokens.claims()!.sid === "string"
            ? (tokens.claims()!.sid as string)
            : undefined,
      },
    );
    res.headers.append("Set-Cookie", cookieHeader(cookieName(), sid, 8 * 3600));
    return res;
  } catch {
    res.headers.set("Location", appOrigin() + "/?auth=failed");
    return res;
  }
}
