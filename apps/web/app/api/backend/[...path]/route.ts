import { NextResponse } from "next/server";
import { getSession } from "../../../../lib/session";
import { sameOrigin } from "../../../../lib/security";
export const runtime = "nodejs";
async function proxy(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    if (req.method !== "GET" && !sameOrigin(req))
      return NextResponse.json({ code: "forbidden" }, { status: 403 });
    const session = await getSession(req);
    if (!session)
      return NextResponse.json({ code: "unauthenticated" }, { status: 401 });
    const { path } = await context.params;
    if (
      !path.length ||
      path.length > 3 ||
      ![
        "tree",
        "me",
        "resources",
        "translations",
        "targets",
        "production",
        "stops",
        "summary",
        "export",
        "plans",
        "audit",
        "recipients",
        "reports",
      ].includes(path[0]) ||
      path.some((p) => !/^[-A-Za-z0-9]+$/.test(p))
    )
      return NextResponse.json({ code: "not_found" }, { status: 404 });
    const url = new URL(
      (process.env.API_INTERNAL_URL || "http://localhost:4000") +
        "/" +
        path.join("/"),
    );
    url.search = new URL(req.url).search;
    let body: string | undefined;
    if (req.method !== "GET") {
      if (!req.headers.get("content-type")?.startsWith("application/json"))
        return NextResponse.json(
          { code: "invalid_content_type" },
          { status: 415 },
        );
      const bytes = await req.arrayBuffer();
      if (bytes.byteLength > 524288)
        return NextResponse.json(
          { code: "payload_too_large" },
          { status: 413 },
        );
      body = new TextDecoder().decode(bytes);
    }
    const response = await fetch(url, {
      method: req.method,
      headers: {
        Authorization: "Bearer " + session.tokens.accessToken,
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type":
        response.headers.get("content-type") || "application/json",
    });
    const disposition = response.headers.get("content-disposition");
    if (disposition) headers.set("Content-Disposition", disposition);
    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch {
    return NextResponse.json({ code: "service_unavailable" }, { status: 503 });
  }
}
export const GET = proxy,
  POST = proxy,
  PUT = proxy;
