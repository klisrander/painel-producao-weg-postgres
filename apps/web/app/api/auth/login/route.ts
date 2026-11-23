import { NextResponse } from "next/server";
import * as oidc from "openid-client";
import { provider, store } from "../../../../lib/session";
import {
  random,
  digest,
  seal,
  cookieHeader,
  cookieName,
  appOrigin,
} from "../../../../lib/security";
export const runtime = "nodejs";
export async function GET() {
  try {
    const config = await provider(),
      verifier = oidc.randomPKCECodeVerifier(),
      state = oidc.randomState(),
      nonce = oidc.randomNonce(),
      flow = random();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: appOrigin() + "/api/auth/callback",
      scope: "openid profile",
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
    });
    await (
      await store()
    ).set(
      "panel:flow:" + digest(flow),
      await seal({ state, nonce, verifier }, 600),
      { EX: 600, NX: true },
    );
    const res = NextResponse.redirect(url);
    res.headers.set(
      "Set-Cookie",
      cookieHeader(cookieName() + "-flow", flow, 600),
    );
    return res;
  } catch {
    return NextResponse.redirect(appOrigin() + "/?auth=unavailable");
  }
}
