import { z } from "zod";
import { DEFAULT_TIMEZONE } from "../defaults";
import { isCommonPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../passwords";
import { normalizePhone } from "../phone";
import { RESERVED_SLUGS, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH, SLUG_PATTERN } from "../slug";

/** Auth contracts (PROMPT §12.2, §15). Used by the signup/login forms (step 1.4) and the API DTOs. */

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((value) => !isCommonPassword(value), "This password is too common. Choose another one.");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(SLUG_MIN_LENGTH, `Use at least ${SLUG_MIN_LENGTH} characters`)
  .max(SLUG_MAX_LENGTH, `Use at most ${SLUG_MAX_LENGTH} characters`)
  .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens")
  .refine((value) => !RESERVED_SLUGS.has(value), "This address is reserved. Choose another one.");

/**
 * IANA zone names like "Asia/Kolkata" (or "UTC"). Validated with Intl.DateTimeFormat rather than
 * Intl.supportedValuesOf, which lists only canonical names — ICU still lists India as "Asia/Calcutta".
 * The name pattern keeps out raw offsets such as "+05:30" that DateTimeFormat would also accept.
 */
const IANA_ZONE_PATTERN = /^(UTC|[A-Z][A-Za-z_]+(\/[A-Za-z0-9_+-]+)+)$/;

function isTimeZone(value: string): boolean {
  if (!IANA_ZONE_PATTERN.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z.string().max(64).refine(isTimeZone, "Choose a valid time zone");

/** Optional phone: empty means "not given"; otherwise it must be a valid number (normalised server-side). */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(32)
  .refine((value) => value === "" || normalizePhone(value) !== null, "Enter a valid phone number")
  .optional();

export const COACHING_MODES = ["in_person", "online", "hybrid"] as const;
export type CoachingMode = (typeof COACHING_MODES)[number];

export const SIGNUP_MODES = ["invite_code", "approval", "open"] as const;
export type SignupMode = (typeof SIGNUP_MODES)[number];

/** Trainer signup — the three steps of the form: Account → Profile → Business (ADR-0032). */
export const signupRequestSchema = z.object({
  account: z.object({
    email: emailSchema,
    password: passwordSchema,
  }),
  profile: z.object({
    displayName: z.string().trim().min(2, "Enter your name").max(80),
    phone: optionalPhoneSchema,
  }),
  business: z.object({
    businessName: z.string().trim().min(2, "Enter your business name").max(80),
    slug: slugSchema,
    city: z.string().trim().max(80).optional(),
    coachingModes: z.array(z.enum(COACHING_MODES)).min(1, "Choose at least one").max(3),
    timezone: timezoneSchema.default(DEFAULT_TIMEZONE),
  }),
  /** Required while SIGNUP_MODE=invite_code (closed beta). */
  inviteCode: z.string().trim().max(32).optional(),
  acceptTerms: z.literal(true, "Accept the terms and privacy policy to continue"),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const emailOnlyRequestSchema = z.object({ email: emailSchema });
export type EmailOnlyRequest = z.infer<typeof emailOnlyRequestSchema>;

export const tokenRequestSchema = z.object({ token: z.string().min(16).max(128) });
export type TokenRequest = z.infer<typeof tokenRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  token: z.string().min(16).max(128),
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/**
 * Returned by signup, resend-verification and forgot-password whatever the outcome, so responses
 * never reveal whether an email has an account (PROMPT §12.2).
 */
export const acceptedResponseSchema = z.object({ status: z.literal("accepted") });
export type AcceptedResponse = z.infer<typeof acceptedResponseSchema>;

export const okResponseSchema = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof okResponseSchema>;

export const ACTORS = ["trainer", "client", "platform_owner"] as const;
export type ActorKind = (typeof ACTORS)[number];

export const WORKSPACE_STATUSES = [
  "pending_approval",
  "trialing",
  "active",
  "past_due",
  "suspended",
  "cancelled",
] as const;
export type WorkspaceStatus = (typeof WORKSPACE_STATUSES)[number];

export const meResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    emailVerified: z.boolean(),
  }),
  actor: z.enum(ACTORS),
  profile: z.object({ displayName: z.string() }),
  workspace: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      status: z.enum(WORKSPACE_STATUSES),
      timezone: z.string(),
    })
    .nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const sessionSummarySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionsResponseSchema = z.object({ sessions: z.array(sessionSummarySchema) });
export type SessionsResponse = z.infer<typeof sessionsResponseSchema>;
