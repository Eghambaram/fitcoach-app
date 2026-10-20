/**
 * Same-origin API proxy (PROMPT §4.2, D8): `/api/<path>` → `${API_INTERNAL_URL}/<path>` over the
 * private network. Streams the body, forwards cookies, Origin (for CSRF), the client IP and a
 * request id, and passes every Set-Cookie back untouched. Adds nothing else and never caches.
 */

/** Hop-by-hop headers (RFC 9110 §7.6.1) plus ones fetch manages itself. */
const STRIPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "content-length",
]);

// fetch has already decompressed the body, so length/encoding from upstream no longer apply.
const STRIPPED_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
  "set-cookie",
]);

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const TIMEOUT_MS = 30_000;

export async function proxyToApi(
  request: Request,
  apiBaseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const incoming = new URL(request.url);
  // Never resolve the path relative to the base: "//evil.example/x" would become another host (SSRF).
  // Concatenate onto the API origin instead, with leading slashes collapsed.
  const path = incoming.pathname.replace(/^\/api(?=\/|$)/, "").replace(/^\/*/, "/");
  const target = new URL(`${new URL(apiBaseUrl).origin}${path}${incoming.search}`);

  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  });
  const requestId = request.headers.get("x-request-id");
  if (!requestId || !REQUEST_ID.test(requestId)) headers.set("x-request-id", crypto.randomUUID());

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetchImpl(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      // Required by Node's fetch to stream a request body.
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    } as RequestInit);
  } catch {
    return Response.json(
      {
        code: "INTERNAL_ERROR",
        message: "FitCoach is temporarily unavailable. Please try again.",
        requestId: headers.get("x-request-id") ?? "",
      },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) responseHeaders.set(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie())
    responseHeaders.append("set-cookie", cookie);
  responseHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}
