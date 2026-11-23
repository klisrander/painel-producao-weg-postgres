import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { sameOrigin } from "../../../../lib/security";
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ code: "forbidden" }, { status: 403 });
  try {
    const s = await getSession(req, true);
    return NextResponse.json({ active: !!s }, { status: s ? 200 : 401 });
  } catch {
    return NextResponse.json({ code: "service_unavailable" }, { status: 503 });
  }
}
