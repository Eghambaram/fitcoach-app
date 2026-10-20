import { Algorithm, hash, verify } from "@node-rs/argon2";

/** argon2id with OWASP's recommended minimum (19 MiB, 2 iterations, 1 lane) — PROMPT §12.2. */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same argon2 work when there is no account (or no password), so login and signup take
 * the same time whether or not an email is registered (non-enumerating, PROMPT §12.2).
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("fitcoach-timing-equaliser");
  await verifyPassword(await dummyHash, password);
  return false;
}
