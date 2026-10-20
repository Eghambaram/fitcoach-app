import { describe, expect, it, vi } from "vitest";
import { proxyToApi } from "./proxy";

type Captured = { url: string; init: RequestInit & { duplex?: string } };

function upstreamReturning(response: Response) {
  const calls: Captured[] = [];
  const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init as Captured["init"] });
    return response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("proxyToApi", () => {
  it("maps /api/<path> to the API and keeps the query string", async () => {
    const { fetchImpl, calls } = upstreamReturning(new Response("{}", { status: 200 }));

    await proxyToApi(
      new Request("http://localhost:3000/api/v1/leads?stage=new&q=asha"),
      "http://api.internal:4000",
      fetchImpl,
    );

    expect(calls[0]?.url).toBe("http://api.internal:4000/v1/leads?stage=new&q=asha");
  });

  it("forwards cookies, Origin and the CSRF header, drops hop-by-hop headers and adds a request id", async () => {
    const { fetchImpl, calls } = upstreamReturning(new Response("{}", { status: 201 }));

    await proxyToApi(
      new Request("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: {
          cookie: "fc_session=abc",
          origin: "http://localhost:3000",
          "x-fitcoach-request": "1",
          "x-forwarded-for": "203.0.113.9",
          connection: "keep-alive",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "a@b.co" }),
      }),
      "http://api.internal:4000",
      fetchImpl,
    );

    const sent = new Headers(calls[0]?.init.headers);
    expect(sent.get("cookie")).toBe("fc_session=abc");
    expect(sent.get("origin")).toBe("http://localhost:3000");
    expect(sent.get("x-fitcoach-request")).toBe("1");
    expect(sent.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(sent.get("connection")).toBeNull();
    expect(sent.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[0]?.init.duplex).toBe("half");
    expect(calls[0]?.init.method).toBe("POST");
  });

  it("passes every Set-Cookie back untouched and never caches", async () => {
    const upstream = new Response('{"ok":true}', {
      status: 200,
      headers: { "content-type": "application/json", "content-encoding": "gzip" },
    });
    upstream.headers.append("set-cookie", "fc_session=new; Path=/; HttpOnly; SameSite=Lax");
    upstream.headers.append("set-cookie", "other=1; Path=/");
    const { fetchImpl } = upstreamReturning(upstream);

    const response = await proxyToApi(
      new Request("http://localhost:3000/api/v1/auth/login", { method: "POST", body: "{}" }),
      "http://api.internal:4000",
      fetchImpl,
    );

    expect(response.headers.getSetCookie()).toEqual([
      "fc_session=new; Path=/; HttpOnly; SameSite=Lax",
      "other=1; Path=/",
    ]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-encoding")).toBeNull();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("keeps API error statuses and bodies", async () => {
    const { fetchImpl } = upstreamReturning(
      Response.json({ code: "FORBIDDEN", message: "No", requestId: "r1" }, { status: 403 }),
    );

    const response = await proxyToApi(
      new Request("http://localhost:3000/api/v1/platform/access"),
      "http://api.internal:4000",
      fetchImpl,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "FORBIDDEN" });
  });

  it("answers 502 in the error contract when the API is unreachable", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const response = await proxyToApi(
      new Request("http://localhost:3000/api/v1/auth/me"),
      "http://api.internal:4000",
      fetchImpl,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "INTERNAL_ERROR" });
  });

  it("can't be steered to another host", async () => {
    const { fetchImpl, calls } = upstreamReturning(new Response("{}"));

    await proxyToApi(
      new Request("http://localhost:3000/api//evil.example/x"),
      "http://api.internal:4000",
      fetchImpl,
    );

    expect(new URL(calls[0]?.url ?? "").host).toBe("api.internal:4000");
  });
});
