import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { generateBetaCode, hashToken, normalizeBetaCode } from "../../common/security/tokens";
import type { Tx } from "../../db/database";
import { betaInvites } from "../../db/schema";
import { recordAudit } from "../audit/audit.service";

/**
 * Closed-beta signup codes (PROMPT §1A.6, ADR-0029). Used by the `pnpm beta:invite` CLI now and the
 * platform UI in step 6.1. All functions run in a fitcoach_system transaction (SystemDb / CLI).
 */

export interface CreateBetaInviteInput {
  maxUses: number;
  expiresAt: Date;
  label?: string;
  /** Who created it, for the audit trail: "cli" or a platform owner's user id. */
  createdBy: string;
}

export interface CreatedBetaInvite {
  id: string;
  /** Shown once. Only its HMAC is stored. */
  code: string;
  maxUses: number;
  expiresAt: Date;
}

export async function createBetaInvite(
  tx: Tx,
  secret: string,
  input: CreateBetaInviteInput,
): Promise<CreatedBetaInvite> {
  const code = generateBetaCode();
  const [row] = await tx
    .insert(betaInvites)
    .values({
      codeHash: hashToken(secret, normalizeBetaCode(code)),
      label: input.label,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
    })
    .returning({ id: betaInvites.id });
  if (!row) throw new Error("beta invite insert returned no row");

  await recordAudit(tx, {
    actorKind: input.createdBy === "cli" ? "cli" : "platform_owner",
    actorUserId: input.createdBy === "cli" ? null : input.createdBy,
    workspaceId: null,
    action: "beta_invite.created",
    targetType: "beta_invite",
    targetId: row.id,
    after: {
      maxUses: input.maxUses,
      expiresAt: input.expiresAt.toISOString(),
      label: input.label ?? null,
    },
  });
  return { id: row.id, code, maxUses: input.maxUses, expiresAt: input.expiresAt };
}

export interface BetaInviteSummary {
  id: string;
  label: string | null;
  uses: number;
  maxUses: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export function listBetaInvites(tx: Tx): Promise<BetaInviteSummary[]> {
  return tx
    .select({
      id: betaInvites.id,
      label: betaInvites.label,
      uses: betaInvites.uses,
      maxUses: betaInvites.maxUses,
      expiresAt: betaInvites.expiresAt,
      revokedAt: betaInvites.revokedAt,
      createdAt: betaInvites.createdAt,
    })
    .from(betaInvites)
    .orderBy(desc(betaInvites.createdAt));
}

export async function revokeBetaInvite(tx: Tx, id: string, revokedBy: string): Promise<boolean> {
  const revoked = await tx
    .update(betaInvites)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(betaInvites.id, id), isNull(betaInvites.revokedAt)))
    .returning({ id: betaInvites.id });
  if (revoked.length === 0) return false;

  await recordAudit(tx, {
    actorKind: revokedBy === "cli" ? "cli" : "platform_owner",
    actorUserId: revokedBy === "cli" ? null : revokedBy,
    workspaceId: null,
    action: "beta_invite.revoked",
    targetType: "beta_invite",
    targetId: id,
  });
  return true;
}

/**
 * Uses one slot of a valid code inside the signup transaction. The row lock makes the last slot
 * of a code go to exactly one of two simultaneous signups. Returns the invite id, or null.
 */
export async function consumeBetaInvite(
  tx: Tx,
  secret: string,
  code: string,
): Promise<string | null> {
  const codeHash = hashToken(secret, normalizeBetaCode(code));
  const [invite] = await tx
    .select({ id: betaInvites.id })
    .from(betaInvites)
    .where(
      and(
        eq(betaInvites.codeHash, codeHash),
        isNull(betaInvites.revokedAt),
        gt(betaInvites.expiresAt, sql`now()`),
        lt(betaInvites.uses, betaInvites.maxUses),
      ),
    )
    .for("update");
  if (!invite) return null;

  await tx
    .update(betaInvites)
    .set({ uses: sql`${betaInvites.uses} + 1` })
    .where(eq(betaInvites.id, invite.id));
  return invite.id;
}
