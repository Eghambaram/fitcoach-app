import { z } from "zod";
import { normalizePhone } from "../phone";
import { COACHING_MODES, emailSchema } from "./auth";
import { FITNESS_GOALS, LEAD_SOURCES, LEAD_STAGES, type LeadStage } from "./leads";

/** Lead CRM contracts (PROMPT §8.2, step 2.2): list, counts, add, edit, stage, notes, duplicates. */

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  trial_booked: "Trial booked",
  interested: "Interested",
  converted: "Converted",
  lost: "Lost",
};

/** Stages a trainer can set by hand; `converted` is set only by the conversion service (step 2.4). */
export const MANUAL_LEAD_STAGES = [
  "new",
  "contacted",
  "trial_booked",
  "interested",
  "lost",
] as const satisfies readonly LeadStage[];
export type ManualLeadStage = (typeof MANUAL_LEAD_STAGES)[number];

/** "Open" = still in the pipeline. */
export const OPEN_LEAD_STAGES = [
  "new",
  "contacted",
  "trial_booked",
  "interested",
] as const satisfies readonly LeadStage[];

export const LOST_REASONS = [
  "price",
  "timing",
  "location",
  "chose_another_coach",
  "no_response",
  "not_a_fit",
  "other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: "Price",
  timing: "Timing or schedule",
  location: "Location",
  chose_another_coach: "Chose another coach",
  no_response: "Stopped responding",
  not_a_fit: "Not a good fit",
  other: "Other",
};

export const LEAD_SORTS = ["newest", "oldest", "name", "last_contact"] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export const LEAD_SORT_LABELS: Record<LeadSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name A–Z",
  last_contact: "Last contacted",
};

export const LEAD_LIST_LIMIT_MAX = 100;
/** CSV export cap; a beta workspace is far below it. */
export const LEAD_EXPORT_MAX = 5_000;

/** Query-string booleans: "true"/"1" → true; anything else → false. */
const queryBoolean = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === "true" || value === "1")
  .default(false);

/** Filters shared by the list, the tab counts and the CSV export. */
export const leadFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  mode: z.enum(COACHING_MODES).optional(),
  archived: queryBoolean,
});
export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export const leadListQuerySchema = leadFiltersSchema.extend({
  stage: z.enum(LEAD_STAGES).optional(),
  sort: z.enum(LEAD_SORTS).default("newest"),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(LEAD_LIST_LIMIT_MAX).default(25),
});
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export type LeadListQueryInput = z.input<typeof leadListQuerySchema>;

export const leadListItemSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  phoneE164: z.string().max(16).nullable(),
  email: z.string().max(254).nullable(),
  goal: z.enum(FITNESS_GOALS),
  trainingMode: z.enum(COACHING_MODES).nullable(),
  source: z.enum(LEAD_SOURCES),
  stage: z.enum(LEAD_STAGES),
  lastContactAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  archived: z.boolean(),
});
export type LeadListItem = z.infer<typeof leadListItemSchema>;

export const leadListResponseSchema = z.object({
  items: z.array(leadListItemSchema),
  nextCursor: z.string().max(400).nullable(),
});
export type LeadListResponse = z.infer<typeof leadListResponseSchema>;

export const leadsSummaryResponseSchema = z.object({
  /** Per stage, for the tabs, under the current filters (search, source, mode, archived). */
  stageCounts: z.object({
    all: z.number().int(),
    new: z.number().int(),
    contacted: z.number().int(),
    trial_booked: z.number().int(),
    interested: z.number().int(),
    converted: z.number().int(),
    lost: z.number().int(),
  }),
  /** Workspace-wide, in the workspace's time zone. */
  kpis: z.object({
    open: z.number().int(),
    newThisWeek: z.number().int(),
    fromPublicPage30Days: z.number().int(),
  }),
});
export type LeadsSummaryResponse = z.infer<typeof leadsSummaryResponseSchema>;

const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional();

/** Phone as typed; the API normalises it to E.164 with the workspace country (CLAUDE.md gotchas). */
const leadPhoneSchema = z
  .string()
  .trim()
  .max(32)
  .refine((value) => value === "" || normalizePhone(value) !== null, "Enter a valid phone number")
  .optional();

const leadDetailsShape = {
  fullName: z.string().trim().min(1, "Enter a name").max(80),
  phone: leadPhoneSchema,
  email: z.union([z.literal(""), emailSchema]).optional(),
  goal: z.enum(FITNESS_GOALS, "Choose a goal"),
  source: z.enum(LEAD_SOURCES, "Choose how they heard about you"),
  trainingMode: z.enum(COACHING_MODES).nullish(),
  preferredSchedule: optionalText(200),
  location: optionalText(120),
  interestedService: optionalText(120),
  referrer: optionalText(120),
  campaign: optionalText(100),
};

const hasContact = (value: { phone?: string; email?: string }) =>
  Boolean(value?.phone) || Boolean(value?.email);
/** `when`: report a missing contact together with the other field errors, not after them. */
const contactIssue = {
  path: ["phone"],
  message: "Add a phone number or an email",
  when: (payload: { value: unknown }) =>
    typeof payload.value === "object" && payload.value !== null,
};

/** Add Lead (PROMPT §8.2): name, a phone or an email, goal and source are required. */
export const createLeadRequestSchema = z
  .object({ ...leadDetailsShape, note: optionalText(2000) })
  .refine(hasContact, contactIssue);
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;
export type CreateLeadInput = z.input<typeof createLeadRequestSchema>;

export const updateLeadRequestSchema = z.object(leadDetailsShape).refine(hasContact, contactIssue);
export type UpdateLeadRequest = z.infer<typeof updateLeadRequestSchema>;
export type UpdateLeadInput = z.input<typeof updateLeadRequestSchema>;

export const changeLeadStageRequestSchema = z
  .object({
    stage: z.enum(MANUAL_LEAD_STAGES),
    lostReason: z.enum(LOST_REASONS).optional(),
    /** Optional "try again after" date (YYYY-MM-DD) for lost leads. */
    nurtureUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
      .optional(),
  })
  .refine((value) => value.stage !== "lost" || value.lostReason !== undefined, {
    path: ["lostReason"],
    message: "Choose why the lead was lost",
  });
export type ChangeLeadStageRequest = z.infer<typeof changeLeadStageRequestSchema>;

export const LEAD_NOTE_MAX = 2000;
export const leadNoteRequestSchema = z.object({
  body: z.string().trim().min(1, "Write a note").max(LEAD_NOTE_MAX),
});
export type LeadNoteRequest = z.infer<typeof leadNoteRequestSchema>;

export const LEAD_ACTIVITY_TYPES = [
  "enquiry_received",
  "created",
  "details_updated",
  "stage_changed",
  "note",
  "archived",
  "restored",
] as const;
export type LeadActivityType = (typeof LEAD_ACTIVITY_TYPES)[number];

export const leadActivitySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(LEAD_ACTIVITY_TYPES),
  /** Type-specific: `{ from, to, lostReason }`, `{ fields }`, `{ source }`. */
  data: z.record(z.string(), z.unknown()),
  actorKind: z.enum(["trainer", "system"]),
  createdAt: z.string().datetime(),
});
export type LeadActivity = z.infer<typeof leadActivitySchema>;

export const leadNoteSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type LeadNote = z.infer<typeof leadNoteSchema>;

export const leadDetailResponseSchema = leadListItemSchema.extend({
  preferredSchedule: z.string().max(200).nullable(),
  message: z.string().max(1000).nullable(),
  location: z.string().max(120).nullable(),
  interestedService: z.string().max(120).nullable(),
  referrer: z.string().max(120).nullable(),
  campaign: z.string().max(100).nullable(),
  utm: z.record(z.string(), z.string()),
  createdVia: z.enum(["public_page", "manual"]),
  lostReason: z.enum(LOST_REASONS).nullable(),
  nurtureUntil: z.string().max(10).nullable(),
  /** The consent given on the enquiry form, with the exact wording of that form version. */
  consent: z
    .object({
      version: z.number().int(),
      text: z.string(),
      consentedAt: z.string().datetime(),
    })
    .nullable(),
  /** Timeline, newest first. Notes are listed separately. */
  activities: z.array(leadActivitySchema),
  notes: z.array(leadNoteSchema),
  /** Deleting is allowed only while nothing has happened beyond creation; otherwise archive. */
  canDelete: z.boolean(),
});
export type LeadDetailResponse = z.infer<typeof leadDetailResponseSchema>;

export const duplicateCheckRequestSchema = z.object({
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().max(254).optional(),
  /** When editing, a lead isn't a duplicate of itself. */
  excludeLeadId: z.string().uuid().optional(),
});
export type DuplicateCheckRequest = z.infer<typeof duplicateCheckRequestSchema>;

export const duplicateCheckResponseSchema = z.object({
  matches: z.array(
    z.object({
      kind: z.enum(["lead"]),
      id: z.string().uuid(),
      fullName: z.string(),
      stage: z.enum(LEAD_STAGES),
      matchedOn: z.array(z.enum(["phone", "email"])),
    }),
  ),
});
export type DuplicateCheckResponse = z.infer<typeof duplicateCheckResponseSchema>;
