import { describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, createApiClient } from "./index";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("createApiClient", () => {
  it("sends the CSRF header on every request", async () => {
    const fetchMock = vi.fn<(input: Request) => Promise<Response>>(async () =>
      jsonResponse({ status: "ok" }),
    );
    const client = createApiClient({ baseUrl: "http://api.test", fetch: fetchMock });

    const { data } = await client.GET("/v1/health");

    const request = fetchMock.mock.calls[0]?.[0];
    expect(request?.headers.get(CSRF_HEADER)).toBe("1");
    expect(request?.url).toBe("http://api.test/v1/health");
    expect(data?.status).toBe("ok");
  });

  it("keeps caller-supplied headers", async () => {
    const fetchMock = vi.fn<(input: Request) => Promise<Response>>(async () =>
      jsonResponse({ status: "ok" }),
    );
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: fetchMock,
      headers: { "x-request-id": "abc" },
    });

    await client.GET("/v1/health");

    expect(fetchMock.mock.calls[0]?.[0].headers.get("x-request-id")).toBe("abc");
  });
});
