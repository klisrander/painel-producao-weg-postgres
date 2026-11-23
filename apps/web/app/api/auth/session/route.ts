import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const s = await getSession(req);
    if (!s) return NextResponse.json({ authenticated: false }, { status: 401 });
    const res = await fetch(
      (process.env.API_INTERNAL_URL || "http://localhost:4000") + "/me",
      {
        headers: { Authorization: "Bearer " + s.tokens.accessToken },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!res.ok)
      return NextResponse.json(
        { authenticated: false },
        { status: res.status },
      );
    return NextResponse.json(
      {
        authenticated: true,
        principal: await res.json(),
        idleExpiresAt: s.last + 15 * 60000,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ code: "service_unavailable" }, { status: 503 });
  }
}
