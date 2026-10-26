import { z } from "zod";

/** Calendar, appointments, recurring series and attendance (PROMPT §8.6, step 2.6). */

export const APPOINTMENT_KINDS = ["session", "online_session", "trial", "consultation"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];
export const APPOINTMENT_KIND_LABELS: Record<AppointmentKind, string> = {
  session: "Session",
  online_session: "Online session",
  trial: "Trial",
  consultation: "Consultation",
};
/** Recurring series are regular client sessions. */
export const SERIES_KINDS = ["session", "online_session"] as const;

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Attended",
  cancelled: "Cancelled",
  no_show: "No-show",
};
/** Statuses that hold the time slot (the exclusion constraint applies to these). */
export const ACTIVE_APPOINTMENT_STATUSES = ["scheduled", "confirmed"] as const;

/** ISO weekdays: 1 = Monday … 7 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

export const SERIES_MAX_OCCURRENCES = 52;
/** The calendar loads at most six weeks at a time. */
export const APPOINTMENT_RANGE_MAX_DAYS = 42;

export const CHANGE_SCOPES = ["this", "following"] as const;
export type ChangeScope = (typeof CHANGE_SCOPES)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time");
const duration = z
  .number("Enter the length in minutes")
  .int("Use whole minutes")
  .min(15, "At least 15 minutes")
  .max(480, "At most 8 hours");
const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional();
const meetingUrl = z
  .union([
    z.literal(""),
    z.string().trim().url("Enter a full link, e.g. https://meet.google.com/…").max(300),
  ])
  .optional();

/** Date and time are local to the workspace time zone (CLAUDE.md rule 19). */
const slotShape = {
  date: isoDate,
  startTime: time,
  durationMin: duration,
  location: optionalText(120),
  meetingUrl,
};

/** Book one appointment, for a client or (trials, consultations) a lead. */
export const createAppointmentRequestSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    kind: z.enum(APPOINTMENT_KINDS, "Choose a session type"),
    ...slotShape,
    notes: optionalText(2000),
  })
  .refine((value) => (value.clientId ? 1 : 0) + (value.leadId ? 1 : 0) === 1, {
    path: ["clientId"],
    message: "Choose a client",
  });
export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>;
export type CreateAppointmentInput = z.input<typeof createAppointmentRequestSchema>;

/** Recurring series (§8.6): weekdays + time, until a date or for a number of sessions (≤ 52). */
export const seriesRequestSchema = z
  .object({
    clientId: z.string().uuid("Choose a client"),
    kind: z.enum(SERIES_KINDS),
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1, "Choose at least one day")
      .max(7)
      .refine((days) => new Set(days).size === days.length, "Each day once"),
    startTime: time,
    durationMin: duration,
    startsOn: isoDate,
    endsOn: isoDate.optional(),
    occurrenceCount: z
      .number("Enter a number")
      .int()
      .min(1, "At least 1 session")
      .max(SERIES_MAX_OCCURRENCES, `At most ${SERIES_MAX_OCCURRENCES} sessions`)
      .optional(),
    location: optionalText(120),
    meetingUrl,
    /** Occurrences to leave out (usually the ones that conflict). */
    skipDates: z.array(isoDate).max(SERIES_MAX_OCCURRENCES).default([]),
  })
  .refine((value) => (value.endsOn ? 1 : 0) + (value.occurrenceCount ? 1 : 0) === 1, {
    path: ["endsOn"],
    message: "Choose an end date or a number of sessions",
  })
  .refine((value) => !value.endsOn || value.endsOn >= value.startsOn, {
    path: ["endsOn"],
    message: "End after the start date",
  });
export type SeriesRequest = z.infer<typeof seriesRequestSchema>;
export type SeriesInput = z.input<typeof seriesRequestSchema>;

export const appointmentConflictSchema = z.object({
  appointmentId: z.string().uuid(),
  title: z.string(),
  startTime: z.string(),
});

export const seriesPreviewResponseSchema = z.object({
  occurrences: z.array(
    z.object({
      date: isoDate,
      startTime: time,
      conflict: appointmentConflictSchema.nullable(),
    }),
  ),
  /** True when the end date allowed more than 52 sessions; only the first 52 are shown. */
  capped: z.boolean(),
});
export type SeriesPreviewResponse = z.infer<typeof seriesPreviewResponseSchema>;

export const seriesCreatedResponseSchema = z.object({
  seriesId: z.string().uuid(),
  created: z.number().int(),
  skipped: z.number().int(),
});
export type SeriesCreatedResponse = z.infer<typeof seriesCreatedResponseSchema>;

/** Reschedule or edit. For a series, `following` changes this and later upcoming occurrences. */
export const updateAppointmentRequestSchema = z.object({
  ...slotShape,
  scope: z.enum(CHANGE_SCOPES).default("this"),
});
export type UpdateAppointmentRequest = z.infer<typeof updateAppointmentRequestSchema>;
export type UpdateAppointmentInput = z.input<typeof updateAppointmentRequestSchema>;

export const cancelAppointmentRequestSchema = z.object({
  reason: z.string().trim().min(1, "Add a reason").max(200),
  scope: z.enum(CHANGE_SCOPES).default("this"),
});
export type CancelAppointmentRequest = z.infer<typeof cancelAppointmentRequestSchema>;

/** Attended, no-show, or `scheduled` to undo a mark. */
export const attendanceRequestSchema = z.object({
  status: z.enum(["completed", "no_show", "scheduled"]),
});
export type AttendanceRequest = z.infer<typeof attendanceRequestSchema>;

export const SESSION_NOTES_MAX = 2000;
export const sessionNotesRequestSchema = z.object({
  notes: z.string().trim().max(SESSION_NOTES_MAX, `Use at most ${SESSION_NOTES_MAX} characters`),
});
export type SessionNotesRequest = z.infer<typeof sessionNotesRequestSchema>;

export const appointmentSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(APPOINTMENT_KINDS),
  status: z.enum(APPOINTMENT_STATUSES),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  /** Local to the workspace time zone. */
  date: isoDate,
  startTime: z.string(),
  endTime: z.string(),
  durationMin: z.number().int(),
  person: z.object({
    kind: z.enum(["client", "lead"]),
    id: z.string().uuid(),
    fullName: z.string(),
  }),
  seriesId: z.string().uuid().nullable(),
  location: z.string().max(120).nullable(),
  meetingUrl: z.string().max(300).nullable(),
  /** Trainer-only. */
  notes: z.string().max(2000).nullable(),
  lateCancel: z.boolean(),
  cancelReason: z.string().max(200).nullable(),
  /** The session has started, so attendance can be marked. */
  started: z.boolean(),
  /** In the past and still scheduled/confirmed: attendance should be marked (§8.6). */
  needsAttendance: z.boolean(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export const appointmentDetailSchema = appointmentSchema.extend({
  changes: z.array(
    z.object({
      id: z.string().uuid(),
      kind: z.enum(["created", "rescheduled", "cancelled", "attendance", "notes"]),
      data: z.record(z.string(), z.unknown()),
      createdAt: z.string().datetime(),
    }),
  ),
});
export type AppointmentDetail = z.infer<typeof appointmentDetailSchema>;

export const appointmentListQuerySchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((value) => value.to >= value.from, { path: ["to"], message: "End after the start" })
  .refine(
    (value) =>
      (Date.parse(value.to) - Date.parse(value.from)) / 86_400_000 < APPOINTMENT_RANGE_MAX_DAYS,
    { path: ["to"], message: `At most ${APPOINTMENT_RANGE_MAX_DAYS} days` },
  );
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

export const appointmentListResponseSchema = z.object({
  appointments: z.array(appointmentSchema),
  timezone: z.string(),
  /** Today in the workspace time zone. */
  today: isoDate,
});
export type AppointmentListResponse = z.infer<typeof appointmentListResponseSchema>;

export const needsAttendanceResponseSchema = z.object({
  appointments: z.array(appointmentSchema),
});
export type NeedsAttendanceResponse = z.infer<typeof needsAttendanceResponseSchema>;
