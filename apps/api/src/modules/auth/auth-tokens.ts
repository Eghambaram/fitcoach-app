import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { generateToken, hashToken } from "../../common/security/tokens";
import type { Tx } from "../../db/database";
import { authTokens } from "../../db/schema";

export type AuthTokenPurpose = "verify_email" | "reset_password";

export const AUTH_TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

/**
 * Issues a single-use token (CLAUDE.md rule 12). Older unused tokens of the same purpose are
 * consumed first, so only the newest link works. Runs in a SystemDb transaction.
 */
export async function issueAuthToken(
  tx: Tx,
  secret: string,
  userId: string,
  purpose: AuthTokenPurpose,
): Promise<string> {
  await tx
    .update(authTokens)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
      ),
    );

  const token = generateToken();
  await tx.insert(authTokens).values({
    userId,
    purpose,
    tokenHash: hashToken(secret, token),
    expiresAt: new Date(Date.now() + AUTH_TOKEN_TTL_MS[purpose]),
  });
  return token;
}

/** Consumes a token exactly once (row-locked). Returns the user id, or null if invalid/expired/used. */
export async function consumeAuthToken(
  tx: Tx,
  secret: string,
  purpose: AuthTokenPurpose,
  token: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ id: authTokens.id, userId: authTokens.userId })
    .from(authTokens)
    .where(
      and(
        eq(authTokens.tokenHash, hashToken(secret, token)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.consumedAt),
        gt(authTokens.expiresAt, sql`now()`),
      ),
    )
    .for("update");
  if (!row) return null;

  await tx
    .update(authTokens)
    .set({ consumedAt: sql`now()` })
    .where(eq(authTokens.id, row.id));
  return row.userId;
}
