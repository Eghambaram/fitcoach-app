import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 32 random bytes, URL-safe — sessions and email links (PROMPT §12.2, CLAUDE.md rule 12). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** What we store instead of a token: HMAC-SHA256 keyed by SESSION_SECRET, hex encoded. */
export function hashToken(secret: string, token: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Crockford-style alphabet: no 0/O, 1/I/L, U — easy to read aloud and type from WhatsApp.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Beta invite code like "FIT-7KQ2-M9XD" (~39 bits; attempts are rate-limited). */
export function generateBetaCode(): string {
  const group = () =>
    Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `FIT-${group()}-${group()}`;
}

/** Accepts codes typed with any case, spaces or dashes: " fit 7kq2-m9xd " → "FIT7KQ2M9XD". */
export function normalizeBetaCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
