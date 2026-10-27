import { z } from "zod";
import { whatsAppLinkSchema } from "./follow-ups";

/** Daily check-ins (PROMPT §8.7, step 4.3). Self-reported; never a diagnosis. */

export const FEELINGS = ["great", "good", "okay", "tired", "poor"] as const;
export type Feeling = (typeof FEELINGS)[number];
export const FEELING_LABELS: Record<Feeling, string> = {
  great: "Great",
  good: "Good",
  okay: "Okay",
  tired: "Tired",
  poor: "Poor",
};
/** For self-reported trend lines only (5 = great … 1 = poor). */
export const FEELING_SCORES: Record<Feeling, number> = {
  great: 5,
  good: 4,
  okay: 3,
  tired: 2,
  poor: 1,
};

export const SORENESS_LEVELS = ["none", "mild", "moderate", "high"] as const;
export type Soreness = (typeof SORENESS_LEVELS)[number];
export const SORENESS_LABELS: Record<Soreness, string> = {
  none: "None",
  mild: "Mild",
  moderate: "Moderate",
  high: "High",
};

const score = z
  .number("Choose a number")
  .int("Use a whole number")
  .min(1, "Use 1 to 10")
  .max(10, "Use 1 to 10");
const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** What the client fills in (< 1 minute). */
export const checkInInputSchema = z.object({
  feeling: z.enum(FEELINGS, "Choose how you feel"),
  energy: score,
  sleep: score,
  soreness: z.enum(SORENESS_LEVELS, "Choose a soreness level"),
  notes: optionalText(1000),
  workoutFeedback: optionalText(1000),
});
export type CheckInInput = z.infer<typeof checkInInputSchema>;

export const checkInSchema = z.object({
  id: z.string().uuid(),
  localDate: isoDate,
  feeling: z.enum(FEELINGS),
  energy: z.number().int(),
  sleep: z.number().int(),
  soreness: z.enum(SORENESS_LEVELS),
  notes: z.string().max(1000).nullable(),
  workoutFeedback: z.string().max(1000).nullable(),
  /** Edited after it was first sent (earlier versions are kept). */
  edited: z.boolean(),
  submittedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable(),
  /** The trainer's note back to the client. */
  reply: z.string().max(1000).nullable(),
});
export type CheckIn = z.infer<typeof checkInSchema>;

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

export const clientCheckInResponseSchema = z.object({
  today: isoDate,
  /** Check-ins are on for this client (the trainer's per-client setting). */
  enabled: z.boolean(),
  /** Today is a check-in day and nothing is sent yet. */
  due: z.boolean(),
  trainerName: z.string(),
  todays: checkInSchema.nullable(),
  /** The last two weeks before today, with any replies. */
  recent: z.array(checkInSchema),
});
export type ClientCheckInResponse = z.infer<typeof clientCheckInResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Trainer
// ---------------------------------------------------------------------------------------------

export const CHECK_IN_REVIEW_FILTERS = ["unreviewed", "reviewed", "all"] as const;
export type CheckInReviewFilter = (typeof CHECK_IN_REVIEW_FILTERS)[number];

export const checkInListQuerySchema = z.object({
  status: z.enum(CHECK_IN_REVIEW_FILTERS).default("all"),
  clientId: z.string().uuid().optional(),
  feeling: z.enum(FEELINGS).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type CheckInListQuery = z.infer<typeof checkInListQuerySchema>;

export const trainerCheckInSchema = checkInSchema.extend({
  client: z.object({ id: z.string().uuid(), fullName: z.string() }),
});
export type TrainerCheckIn = z.infer<typeof trainerCheckInSchema>;

export const CHECK_IN_PAGE_SIZE = 30;

/** The inbox: unreviewed first, then newest. */
export const checkInListResponseSchema = z.object({
  items: z.array(trainerCheckInSchema),
  counts: z.object({ unreviewed: z.number().int(), reviewed: z.number().int() }),
  hasMore: z.boolean(),
});
export type CheckInListResponse = z.infer<typeof checkInListResponseSchema>;

export const reviewCheckInRequestSchema = z.object({
  reply: optionalText(1000),
});
export type ReviewCheckInRequest = z.infer<typeof reviewCheckInRequestSchema>;

const weekday = z.number().int().min(1).max(7);

export const checkInSettingsSchema = z.object({
  enabled: z.boolean(),
  /** The client's own weekdays (1 = Monday … 7 = Sunday), or null for the workspace default. */
  days: z.array(weekday).nullable(),
  /** The days that apply now. */
  effectiveDays: z.array(weekday),
});
export type CheckInSettings = z.infer<typeof checkInSettingsSchema>;

export const updateCheckInSettingsRequestSchema = z.object({
  enabled: z.boolean(),
  days: z
    .array(weekday)
    .min(1, "Pick at least one day")
    .max(7)
    .refine((days) => new Set(days).size === days.length, "Each day once")
    .nullable(),
});
export type UpdateCheckInSettingsRequest = z.infer<typeof updateCheckInSettingsRequestSchema>;

/** Client profile → Check-ins: settings, recent check-ins and self-reported trends. */
export const clientCheckInsResponseSchema = z.object({
  today: isoDate,
  settings: checkInSettingsSchema,
  items: z.array(checkInSchema),
  /** Oldest first, for the self-reported trend chart. */
  trend: z.array(
    z.object({
      date: isoDate,
      energy: z.number().int(),
      sleep: z.number().int(),
      feeling: z.number().int(),
    }),
  ),
  dueToday: z.boolean(),
  /** "Nudge": WhatsApp with the check_in_nudge template (nothing is sent by the app). */
  nudge: whatsAppLinkSchema.nullable(),
});
export type ClientCheckInsResponse = z.infer<typeof clientCheckInsResponseSchema>;
