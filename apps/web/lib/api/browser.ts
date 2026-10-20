import { createApiClient } from "@fitcoach/api-client";
import { toApiRequestError } from "./errors";

/**
 * The browser's API client: same origin only, through the `/api` proxy (PROMPT §4.2, CLAUDE.md
 * rule 10). It sends `X-FitCoach-Request: 1`; the browser adds `Origin` and the session cookie.
 */
export const browserApi = createApiClient({ baseUrl: "/api", credentials: "same-origin" });

/** Unwraps an openapi-fetch result: returns data, or throws ApiRequestError with the error contract. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: { data?: T; error?: unknown; response: Response };
  try {
    result = await call;
  } catch {
    throw toApiRequestError(0, undefined);
  }
  if (!result.response.ok) throw toApiRequestError(result.response.status, result.error);
  return result.data as T;
}
