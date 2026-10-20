import { describe, expect, it } from "vitest";
import { hashIp } from "./ip-hash";

describe("hashIp", () => {
  it("is stable for the same salt and address", () => {
    expect(hashIp("203.0.113.7", "salt-a")).toBe(hashIp("203.0.113.7", "salt-a"));
  });

  it("changes with the salt and never contains the address", () => {
    const hashed = hashIp("203.0.113.7", "salt-a");

    expect(hashed).not.toBe(hashIp("203.0.113.7", "salt-b"));
    expect(hashed).not.toContain("203.0.113.7");
    expect(hashed).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns undefined when there is no address", () => {
    expect(hashIp(undefined, "salt")).toBeUndefined();
  });
});
