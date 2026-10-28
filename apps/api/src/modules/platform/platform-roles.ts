import { eq, sql } from "drizzle-orm";
import type { Tx } from "../../db/database";
import { platformRoles, users } from "../../db/schema";
import { recordAudit } from "../audit/audit.service";

export type GrantResult =
  { status: "granted" | "already_granted"; userId: string } | { status: "no_account" };

/**
 * Grants platform_owner to an existing account (PROMPT §12.2, §16.0). Only reachable through the
 * `pnpm platform:grant <email>` CLI, which runs as fitcoach_system. Audited.
 * The owner enrols an authenticator on their first /platform/login (ADR-0062).
 */
export async function grantPlatformOwner(
  tx: Tx,
  email: string,
  grantedBy: string,
): Promise<GrantResult> {
  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  if (!user) return { status: "no_account" };

  const [existing] = await tx
    .select({ revokedAt: platformRoles.revokedAt })
    .from(platformRoles)
    .where(sql`${platformRoles.userId} = ${user.id} and ${platformRoles.role} = 'platform_owner'`);
  if (existing && existing.revokedAt === null)
    return { status: "already_granted", userId: user.id };

  await tx
    .insert(platformRoles)
    .values({ userId: user.id, role: "platform_owner", grantedBy })
    .onConflictDoUpdate({
      target: [platformRoles.userId, platformRoles.role],
      set: { revokedAt: null, grantedBy, grantedAt: sql`now()` },
    });

  await recordAudit(tx, {
    actorKind: "cli",
    actorUserId: null,
    workspaceId: null,
    action: "platform_role.granted",
    targetType: "user",
    targetId: user.id,
    after: { role: "platform_owner", grantedBy },
  });
  return { status: "granted", userId: user.id };
}
