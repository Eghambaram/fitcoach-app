import { describe, expect, it } from "vitest";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./passwords";
import { generateBetaCode, generateToken, hashToken, normalizeBetaCode, safeEqual } from "./tokens";

describe("tokens", () => {
  it("generates 32-byte URL-safe tokens that don't repeat", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateToken()));

    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("stores a keyed hash, not the token", () => {
    const token = generateToken();
    const hashed = hashToken("secret-a", token);

    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toContain(token);
    expect(hashToken("secret-b", token)).not.toBe(hashed);
  });

  it("compares in constant time and handles different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("generates readable beta codes and normalises what people type", () => {
    const code = generateBetaCode();

    expect(code).toMatch(/^FIT-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
    expect(normalizeBetaCode(` ${code.toLowerCase().replace(/-/g, " ")} `)).toBe(
      code.replace(/-/g, ""),
    );
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const hashed = await hashPassword("correct horse battery");

    expect(hashed).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hashed, "correct horse battery")).resolves.toBe(true);
    await expect(verifyPassword(hashed, "wrong horse battery")).resolves.toBe(false);
  });

  it("treats a corrupt hash as a failed match instead of throwing", async () => {
    await expect(verifyPassword("not-a-hash", "anything")).resolves.toBe(false);
  });

  it("always fails the dummy check", async () => {
    await expect(verifyAgainstDummy("fitcoach-timing-equaliser")).resolves.toBe(false);
  });
});
