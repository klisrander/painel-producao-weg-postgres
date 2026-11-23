import { NextResponse } from "next/server";
import * as oidc from "openid-client";
import { provider, getSession, removeSession } from "../../../../lib/session";
import {
  sameOrigin,
  cookieHeader,
  cookieName,
  appOrigin,
} from "../../../../lib/security";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ code: "forbidden" }, { status: 403 });
  let destination = appOrigin();
  try {
    const s = await getSession(req);
    await removeSession(req);
    if (s?.tokens.idToken)
      destination = oidc.buildEndSessionUrl(await provider(), {
        id_token_hint: s.tokens.idToken,
        post_logout_redirect_uri: appOrigin(),
      }).href;
  } catch {}
  const res = req.headers.get("accept")?.includes("application/json")
    ? NextResponse.json({ url: destination })
    : NextResponse.redirect(destination, 303);
  res.headers.set("Set-Cookie", cookieHeader(cookieName(), "", 0));
  return res;
}
