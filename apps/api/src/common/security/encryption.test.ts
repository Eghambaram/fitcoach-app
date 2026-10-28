import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./encryption";

describe("secret encryption", () => {
  const key = randomBytes(32);

  it("round-trips and never repeats a ciphertext", () => {
    const first = encryptSecret(key, "JBSWY3DPEHPK3PXPJBSWY3DP");
    const second = encryptSecret(key, "JBSWY3DPEHPK3PXPJBSWY3DP");
    expect(first).not.toBe(second);
    expect(first).not.toContain("JBSWY3DP");
    expect(decryptSecret(key, first)).toBe("JBSWY3DPEHPK3PXPJBSWY3DP");
  });

  it("refuses a wrong key or a tampered value", () => {
    const value = encryptSecret(key, "secret");
    expect(() => decryptSecret(randomBytes(32), value)).toThrow();
    const parts = value.split(":");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(() => decryptSecret(key, parts.join(":"))).toThrow();
    expect(() => decryptSecret(key, "plain")).toThrow();
  });
});
