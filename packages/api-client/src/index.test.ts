import { describe, expect, it, vi } from "vitest";
import { CSRF_HEADER, createApiClient } from "./index";

describe("createApiClient", () => {
  it("sends the CSRF header on every request", async () => {
    const fetchMock = vi.fn<(input: Request) => Promise<Response>>(
      async () =>
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const client = createApiClient({ baseUrl: "http://api.test", fetch: fetchMock });

    // `paths` is empty until step 1.2, so call through an untyped path for this test.
    await (client.GET as unknown as (path: string) => Promise<unknown>)("/v1/health");

    const request = fetchMock.mock.calls[0]?.[0];
    expect(request?.headers.get(CSRF_HEADER)).toBe("1");
    expect(request?.url).toBe("http://api.test/v1/health");
  });

  it("keeps caller-supplied headers", async () => {
    const fetchMock = vi.fn<(input: Request) => Promise<Response>>(
      async () => new Response("{}", { status: 200 }),
    );
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: fetchMock,
      headers: { "x-request-id": "abc" },
    });

    await (client.GET as unknown as (path: string) => Promise<unknown>)("/v1/health");

    expect(fetchMock.mock.calls[0]?.[0].headers.get("x-request-id")).toBe("abc");
  });
});
