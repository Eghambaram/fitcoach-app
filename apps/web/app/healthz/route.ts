/** Web liveness for Railway health checks (PROMPT §17.5). Never cached, never calls the API. */
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
