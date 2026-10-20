import { ERROR_CODES, normalizePhone, type SignupRequest } from "@fitcoach/shared";
import { eq, isNull, sql } from "drizzle-orm";
import { DomainError } from "../../common/errors/domain-error";
import type { Tx } from "../../db/database";
import {
  messageTemplates,
  packagePresets,
  profiles,
  trainerSettings,
  users,
  workspaceMembers,
  workspacePlans,
  workspaces,
} from "../../db/schema";
import { trackEvent } from "../product-events/track";

export const BETA_PLAN_ID = "beta";

export interface NewTrainerAccount {
  userId: string;
  workspaceId: string;
}

export interface CreateTrainerAccountOptions {
  passwordHash: string;
  clientLimit: number;
  /** pending_approval when SIGNUP_MODE=approval; otherwise active. */
  workspaceStatus: "active" | "pending_approval";
  /** Seed/dev only: create the account already verified. */
  emailVerified?: boolean;
}

/**
 * Creates everything a new trainer needs in ONE transaction (PROMPT §10.4): user, profile, workspace,
 * membership, settings, the beta plan, and copies of the default message templates and package
 * presets. Runs as fitcoach_system — signup happens before a session exists.
 * The caller has already checked the email is free and consumed the beta code in the same transaction.
 */
export async function createTrainerAccount(
  tx: Tx,
  input: SignupRequest,
  options: CreateTrainerAccountOptions,
): Promise<NewTrainerAccount> {
  const slugTaken = await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, input.business.slug));
  if (slugTaken.length > 0) {
    throw new DomainError(ERROR_CODES.CONFLICT_DUPLICATE, 409, "That page address is taken.", {
      "business.slug": ["This address is already taken. Try another one."],
    });
  }

  const [user] = await tx
    .insert(users)
    .values({
      email: input.account.email,
      passwordHash: options.passwordHash,
      emailVerifiedAt: options.emailVerified ? sql`now()` : null,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("user insert returned no row");

  const phone = input.profile.phone ? normalizePhone(input.profile.phone) : null;
  await tx.insert(profiles).values({
    userId: user.id,
    kind: "trainer",
    displayName: input.profile.displayName,
    phoneE164: phone,
  });

  const [workspace] = await tx
    .insert(workspaces)
    .values({
      ownerUserId: user.id,
      slug: input.business.slug,
      name: input.business.businessName,
      status: options.workspaceStatus,
      city: input.business.city || null,
      coachingModes: input.business.coachingModes,
      timezone: input.business.timezone,
    })
    .returning({ id: workspaces.id });
  if (!workspace) throw new Error("workspace insert returned no row");

  await tx
    .insert(workspaceMembers)
    .values({ workspaceId: workspace.id, userId: user.id, role: "owner" });
  await tx.insert(trainerSettings).values({ workspaceId: workspace.id });
  await tx.insert(workspacePlans).values({
    workspaceId: workspace.id,
    planId: BETA_PLAN_ID,
    maxActiveClients: options.clientLimit,
  });

  // Copy the global defaults (workspace_id IS NULL) so the trainer can edit their own versions.
  const templateDefaults = await tx
    .select({ purpose: messageTemplates.purpose, body: messageTemplates.body })
    .from(messageTemplates)
    .where(isNull(messageTemplates.workspaceId));
  if (templateDefaults.length > 0) {
    await tx
      .insert(messageTemplates)
      .values(templateDefaults.map((t) => ({ ...t, workspaceId: workspace.id })));
  }

  const presetDefaults = await tx
    .select({
      name: packagePresets.name,
      kind: packagePresets.kind,
      sessionsIncluded: packagePresets.sessionsIncluded,
      durationDays: packagePresets.durationDays,
      sessionsPerWeek: packagePresets.sessionsPerWeek,
      sortOrder: packagePresets.sortOrder,
    })
    .from(packagePresets)
    .where(isNull(packagePresets.workspaceId));
  if (presetDefaults.length > 0) {
    await tx
      .insert(packagePresets)
      .values(presetDefaults.map((p) => ({ ...p, workspaceId: workspace.id })));
  }

  await trackEvent(tx, {
    event: "trainer_signed_up",
    actorKind: "trainer",
    userId: user.id,
    workspaceId: workspace.id,
    properties: {
      coachingModes: input.business.coachingModes.join(","),
      hasPhone: phone !== null,
      workspaceStatus: options.workspaceStatus,
    },
  });

  return { userId: user.id, workspaceId: workspace.id };
}
