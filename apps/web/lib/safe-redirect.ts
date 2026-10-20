/**
 * Where to go after login. Only same-site paths are allowed, so `?next=` can't send people to
 * another site (open redirect): "/app/leads" ok · "//evil.com", "https://evil.com", "/\\evil" → fallback.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/app/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  try {
    const url = new URL(next, "http://fitcoach.invalid");
    if (url.origin !== "http://fitcoach.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
