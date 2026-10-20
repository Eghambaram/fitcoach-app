import "server-only";
import { createApiClient } from "@fitcoach/api-client";
import type { MeResponse } from "@fitcoach/shared";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { serverEnv } from "../env";

/**
 * Server Component reads (PROMPT D9): talks to the API over the private network and forwards the
 * session cookie and request id, so the API — not the web — decides what the user may see.
 */
export async function serverApi() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const forwarded: Record<string, string> = {};
  const session = cookieStore.get("fc_session");
  if (session) forwarded.cookie = `fc_session=${session.value}`;
  const requestId = headerStore.get("x-request-id");
  if (requestId) forwarded["x-request-id"] = requestId;
  const clientIp = headerStore.get("x-forwarded-for");
  if (clientIp) forwarded["x-forwarded-for"] = clientIp;

  return createApiClient({
    baseUrl: serverEnv().API_INTERNAL_URL,
    headers: forwarded,
    cache: "no-store",
  });
}

export type SessionResult =
  { status: "signed_in"; me: MeResponse } | { status: "signed_out" } | { status: "unavailable" };

/** Who is signed in, once per request (deduplicated across layout and page). */
export const getSession = cache(async (): Promise<SessionResult> => {
  try {
    const api = await serverApi();
    const { data, response } = await api.GET("/v1/auth/me");
    if (response.status === 401) return { status: "signed_out" };
    if (!response.ok || !data) return { status: "unavailable" };
    return { status: "signed_in", me: data };
  } catch {
    return { status: "unavailable" };
  }
});
