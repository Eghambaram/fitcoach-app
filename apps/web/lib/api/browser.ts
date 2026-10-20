import { createApiClient, CSRF_HEADER } from "@fitcoach/api-client";
import { toApiRequestError } from "./errors";

/**
 * Multipart upload of one file through the `/api` proxy (the typed client doesn't do multipart).
 * Same CSRF header and error contract as every other call.
 */
export async function uploadFile<T>(path: `/v1/${string}`, file: File, field = "file"): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: "POST",
      body: form,
      headers: { [CSRF_HEADER]: "1" },
      credentials: "same-origin",
    });
  } catch {
    throw toApiRequestError(0, undefined);
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) throw toApiRequestError(response.status, body);
  return body as T;
}

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
