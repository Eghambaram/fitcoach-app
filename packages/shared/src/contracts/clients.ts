import { z } from "zod";

/** Clients (PROMPT §8.3) and lead → client conversion (§8.2, step 2.4). */

export const CLIENT_STATUSES = ["onboarding_draft", "active", "paused", "archived"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  onboarding_draft: "Onboarding",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

/**
 * Convert & Continue. By default a new client is created (status `onboarding_draft`, finished by
 * the onboarding wizard); `linkClientId` links the lead to a client who already exists instead.
 * The initial package arrives with packages (step 3.2).
 */
export const convertLeadRequestSchema = z.object({
  linkClientId: z.string().uuid().optional(),
  /** Coaching start date (YYYY-MM-DD), optional. */
  coachingStartOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
    .optional(),
});
export type ConvertLeadRequest = z.infer<typeof convertLeadRequestSchema>;

export const convertLeadResponseSchema = z.object({
  clientId: z.string().uuid(),
  /** The lead was linked to an existing client rather than creating one. */
  linkedExisting: z.boolean(),
  /** Where to continue: the onboarding wizard for a new client. */
  next: z.string().max(300),
});
export type ConvertLeadResponse = z.infer<typeof convertLeadResponseSchema>;

/** Header for critical mutations (PROMPT §4.3): one UUID per user intent; replays return the first answer. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
