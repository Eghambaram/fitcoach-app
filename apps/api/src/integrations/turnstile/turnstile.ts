const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verifies a Cloudflare Turnstile response server-side (PROMPT §8.2, optional). The visitor's IP is
 * deliberately not sent. A network failure counts as "not verified": the visitor can retry, and
 * the other protections still apply.
 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { success?: unknown };
    return body.success === true;
  } catch {
    return false;
  }
}
