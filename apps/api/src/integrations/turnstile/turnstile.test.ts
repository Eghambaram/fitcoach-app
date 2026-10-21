import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "./turnstile";

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("Turnstile verification", () => {
  it("passes only on an explicit success", async () => {
    const ok = reply(200, { success: true });
    expect(await verifyTurnstile("secret-key-123", "token", ok)).toBe(true);
    const sent = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(sent[1].body)).toBe("secret=secret-key-123&response=token");

    expect(await verifyTurnstile("secret-key-123", "token", reply(200, { success: false }))).toBe(
      false,
    );
    expect(await verifyTurnstile("secret-key-123", "token", reply(500, {}))).toBe(false);
  });

  it("treats a network failure as not verified", async () => {
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await verifyTurnstile("secret-key-123", "token", failing)).toBe(false);
  });
});
