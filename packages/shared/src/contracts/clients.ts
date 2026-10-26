import { z } from "zod";
import { COACHING_MODES } from "./auth";
import { FITNESS_GOALS } from "./leads";
import {
  CONSENT_KINDS,
  EXPERIENCE_LEVELS,
  measurementUnitsSchema,
  PREFERRED_CONTACTS,
} from "./onboarding";
import { APPOINTMENT_KINDS, appointmentSchema } from "./scheduling";

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

// ---------------------------------------------------------------------------------------------
// Clients list and detail (PROMPT §8.3, step 3.1)
// ---------------------------------------------------------------------------------------------

export const CLIENT_SORTS = ["name", "newest"] as const;
export type ClientSort = (typeof CLIENT_SORTS)[number];
export const CLIENT_SORT_LABELS: Record<ClientSort, string> = {
  name: "Name A–Z",
  newest: "Newest first",
};

export const CLIENT_LIST_LIMIT_MAX = 100;

export const clientListQuerySchema = z.object({
  status: z.enum(CLIENT_STATUSES).default("active"),
  q: z.string().trim().max(100).optional(),
  goal: z.enum(FITNESS_GOALS).optional(),
  mode: z.enum(COACHING_MODES).optional(),
  sort: z.enum(CLIENT_SORTS).default("name"),
  cursor: z.string().max(400).optional(),
  limit: z.coerce.number().int().min(1).max(CLIENT_LIST_LIMIT_MAX).default(50),
});
export type ClientListQuery = z.infer<typeof clientListQuerySchema>;

export const clientListItemSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  status: z.enum(CLIENT_STATUSES),
  goal: z.enum(FITNESS_GOALS).nullable(),
  trainingMode: z.enum(COACHING_MODES).nullable(),
  phoneE164: z.string().max(16).nullable(),
  /** The next scheduled/confirmed appointment, in the workspace time zone. */
  nextSession: z.object({ date: z.string().max(10), startTime: z.string().max(5) }).nullable(),
  createdAt: z.string().datetime(),
});
export type ClientListItem = z.infer<typeof clientListItemSchema>;

export const clientListResponseSchema = z.object({
  items: z.array(clientListItemSchema),
  nextCursor: z.string().max(400).nullable(),
  /** Per status, under the current search and filters. */
  counts: z.object({
    onboarding_draft: z.number().int(),
    active: z.number().int(),
    paused: z.number().int(),
    archived: z.number().int(),
  }),
});
export type ClientListResponse = z.infer<typeof clientListResponseSchema>;

export const CLIENT_NOTE_MAX = 2000;
export const clientNoteRequestSchema = z.object({
  body: z.string().trim().min(1, "Write a note").max(CLIENT_NOTE_MAX),
});
export type ClientNoteRequest = z.infer<typeof clientNoteRequestSchema>;

/** Lifecycle (§8.3): active ↔ paused ↔ archived. Archiving revokes portal access. */
export const CLIENT_ACTIONS = ["pause", "resume", "archive", "restore"] as const;
export type ClientAction = (typeof CLIENT_ACTIONS)[number];
export const clientStatusRequestSchema = z.object({
  action: z.enum(CLIENT_ACTIONS),
  reason: z.string().trim().max(200).optional(),
});
export type ClientStatusRequest = z.infer<typeof clientStatusRequestSchema>;

export const CLIENT_ACTIVITY_TYPES = [
  "lead_converted",
  "client_onboarded",
  "client_paused",
  "client_resumed",
  "client_archived",
  "client_restored",
  "session_attended",
  "session_no_show",
] as const;
export type ClientActivityType = (typeof CLIENT_ACTIVITY_TYPES)[number];

export const clientDetailSchema = clientListItemSchema.extend({
  email: z.string().max(254).nullable(),
  preferredContact: z.enum(PREFERRED_CONTACTS).nullable(),
  dob: z.string().max(10).nullable(),
  /** Whole years, from the date of birth. */
  age: z.number().int().nullable(),
  location: z.string().max(120).nullable(),
  preferredSchedule: z.string().max(200).nullable(),
  experienceLevel: z.enum(EXPERIENCE_LEVELS).nullable(),
  equipment: z.string().max(200).nullable(),
  /** Trainer-only (never in the client portal). */
  limitations: z.string().max(1000).nullable(),
  emergencyContact: z
    .object({
      name: z.string().max(80),
      phone: z.string().max(16).nullable(),
      relation: z.string().max(40).nullable(),
    })
    .nullable(),
  coachingStartOn: z.string().max(10).nullable(),
  onboardedAt: z.string().datetime().nullable(),
  archivedAt: z.string().datetime().nullable(),
  sourceLeadId: z.string().uuid().nullable(),
  /** Where to finish onboarding, while the client is still onboarding. */
  onboardingLink: z.string().max(300).nullable(),
  timezone: z.string().max(64),
  goals: z.array(
    z.object({
      kind: z.enum(["primary", "secondary"]),
      goal: z.enum(FITNESS_GOALS),
      targetText: z.string().max(200).nullable(),
      targetDate: z.string().max(10).nullable(),
    }),
  ),
  /** The latest record per consent kind. */
  consents: z.array(
    z.object({
      kind: z.enum(CONSENT_KINDS),
      status: z.enum(["granted", "declined", "withdrawn"]),
      noticeVersion: z.number().int(),
      recordedAt: z.string().datetime(),
    }),
  ),
  stats: z.object({
    /** Since the coaching start date, or onboarding. Null until onboarded. */
    weeksWithYou: z.number().int().nullable(),
    sessionsCompleted: z.number().int(),
    nextAppointment: z
      .object({
        id: z.string().uuid(),
        date: z.string().max(10),
        startTime: z.string().max(5),
        kind: z.enum(APPOINTMENT_KINDS),
      })
      .nullable(),
  }),
  /** Latest live value per measurement type, in canonical units (kg, cm, %). */
  measurements: z.array(
    z.object({
      key: z.string().max(40),
      name: z.string().max(60),
      unitKind: z.enum(["mass", "length", "percent", "count"]),
      value: z.number(),
      measuredOn: z.string().max(10),
      /** Count of live values of this type, so charts and trends only show with ≥ 2. */
      points: z.number().int(),
    }),
  ),
  units: measurementUnitsSchema,
  recentActivity: z.array(
    z.object({
      type: z.enum(CLIENT_ACTIVITY_TYPES),
      at: z.string().datetime(),
      data: z.record(z.string(), z.unknown()),
    }),
  ),
  notes: z.array(
    z.object({ id: z.string().uuid(), body: z.string(), createdAt: z.string().datetime() }),
  ),
});
export type ClientDetail = z.infer<typeof clientDetailSchema>;

export const clientScheduleResponseSchema = z.object({
  upcoming: z.array(appointmentSchema),
  past: z.array(appointmentSchema),
});
export type ClientScheduleResponse = z.infer<typeof clientScheduleResponseSchema>;

/** Client picker for booking sessions. */
export const clientOptionsResponseSchema = z.object({
  clients: z.array(
    z.object({ id: z.string().uuid(), fullName: z.string(), status: z.enum(CLIENT_STATUSES) }),
  ),
});
export type ClientOptionsResponse = z.infer<typeof clientOptionsResponseSchema>;
