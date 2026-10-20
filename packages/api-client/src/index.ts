import createClient, { type ClientOptions } from "openapi-fetch";
import type { paths } from "./schema";

export type { paths };

/** Header the API requires on every state-changing request (CLAUDE.md rule 11, PROMPT §12.2). */
export const CSRF_HEADER = "X-FitCoach-Request";

/**
 * Creates a typed client. In the browser `baseUrl` is the same-origin `/api` proxy;
 * on the server it is `API_INTERNAL_URL` (PROMPT §4.2). Never the API's public domain from the browser.
 */
export function createApiClient(options: ClientOptions & { baseUrl: string }) {
  const headers = new Headers(options.headers as HeadersInit | undefined);
  headers.set(CSRF_HEADER, "1");
  return createClient<paths>({ ...options, headers });
}
