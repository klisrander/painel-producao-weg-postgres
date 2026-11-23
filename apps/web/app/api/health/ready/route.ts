import { store } from "../../../../lib/session";
export async function GET() {
  try {
    await (await store()).ping();
    const response = await fetch(
      (process.env.API_INTERNAL_URL || "http://localhost:4000") +
        "/health/ready",
      { cache: "no-store", signal: AbortSignal.timeout(3000) },
    );
    return Response.json(
      { status: response.ok ? "ok" : "unavailable" },
      { status: response.ok ? 200 : 503 },
    );
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
