import { proxyToApi } from "@/lib/api/proxy";
import { serverEnv } from "@/lib/env";

/** `/api/*` → API over the private network (PROMPT §4.2). Never cached, never static. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function handle(request: Request): Promise<Response> {
  return proxyToApi(request, serverEnv().API_INTERNAL_URL);
}

export {
  handle as DELETE,
  handle as GET,
  handle as HEAD,
  handle as OPTIONS,
  handle as PATCH,
  handle as POST,
  handle as PUT,
};
