import { z } from "zod";
import { emailSchema } from "./auth";
import { WEIGHT_UNITS, LENGTH_UNITS } from "./settings";
import { whatsAppLinkSchema } from "./follow-ups";
import { FITNESS_GOALS } from "./leads";
import { PREFERRED_CONTACTS } from "./onboarding";
import { clientPortalPackageSchema } from "./packages";
import { WORKOUT_SESSION_STATUSES } from "./programs";
import { APPOINTMENT_KINDS, APPOINTMENT_STATUSES } from "./scheduling";
import { workoutDetailSchema } from "./workouts";

/** Client portal access: invite links, client sign-in and the portal's own profile (D19, step 4.1). */

export const CLIENT_INVITE_TTL_DAYS = 7;
export const CLIENT_OTP_LENGTH = 6;
export const CLIENT_OTP_TTL_MINUTES = 10;
export const CLIENT_OTP_MAX_ATTEMPTS = 5;
/** Version of the client terms shown on the invite screen; recorded when accepted. */
export const CLIENT_TERMS_VERSION = 1;

export const PORTAL_STATUSES = ["not_invited", "invited", "expired", "active", "revoked"] as const;
export type PortalStatus = (typeof PORTAL_STATUSES)[number];
export const PORTAL_STATUS_LABELS: Record<PortalStatus, string> = {
  not_invited: "Not invited",
  invited: "Invited",
  expired: "Invite expired",
  active: "Active",
  revoked: "Access revoked",
};

export const INVITE_CHANNELS = ["whatsapp", "email"] as const;
export type InviteChannel = (typeof INVITE_CHANNELS)[number];

/** Per-client feature flags (§8.3). Check-ins and progress self-logging take effect in 4.3/4.4. */
export const clientFeaturesSchema = z.object({
  workoutSelfLogging: z.boolean(),
  checkIns: z.boolean(),
  progressSelfLogging: z.boolean(),
});
export type ClientFeatures = z.infer<typeof clientFeaturesSchema>;
export const updateClientFeaturesRequestSchema = clientFeaturesSchema.partial();
export type UpdateClientFeaturesRequest = z.infer<typeof updateClientFeaturesRequestSchema>;

/** Trainer view of a client's portal access (§8.3). */
export const portalAccessSchema = z.object({
  status: z.enum(PORTAL_STATUSES),
  /** The open link, if any (the link itself is only shown once, when created). */
  invite: z
    .object({
      channel: z.enum(INVITE_CHANNELS),
      createdAt: z.string().datetime(),
      expiresAt: z.string().datetime(),
    })
    .nullable(),
  /** When the client first accepted an invite. */
  joinedAt: z.string().datetime().nullable(),
  canWhatsApp: z.boolean(),
  canEmail: z.boolean(),
  features: clientFeaturesSchema,
});
export type PortalAccess = z.infer<typeof portalAccessSchema>;

export const createInviteRequestSchema = z.object({
  channel: z.enum(INVITE_CHANNELS),
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

export const createInviteResponseSchema = z.object({
  access: portalAccessSchema,
  /** The new link: shown once so the trainer can copy it. Older open links stop working. */
  link: z.string().url(),
  expiresAt: z.string().datetime(),
  /** Prefilled click-to-chat for the WhatsApp channel (nothing is sent by the app). */
  whatsApp: whatsAppLinkSchema.nullable(),
  /** Email channel: whether the email was handed to the provider. */
  emailed: z.boolean(),
});
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Public: invite link and email code (pre-session)
// ---------------------------------------------------------------------------------------------

const inviteTokenSchema = z.string().min(20).max(200);

export const invitePreviewRequestSchema = z.object({ token: inviteTokenSchema });
export type InvitePreviewRequest = z.infer<typeof invitePreviewRequestSchema>;

/** Only who invited them — never the client's own data before the link is used (§12.2). */
export const invitePreviewResponseSchema = z.object({
  trainerName: z.string(),
  businessName: z.string(),
  trainerAvatarUrl: z.string().url().nullable(),
});
export type InvitePreviewResponse = z.infer<typeof invitePreviewResponseSchema>;

export const acceptInviteRequestSchema = z.object({
  token: inviteTokenSchema,
  acceptTerms: z.literal(true, "Accept the terms to continue"),
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

export const requestCodeRequestSchema = z.object({ email: emailSchema });
export type RequestCodeRequest = z.infer<typeof requestCodeRequestSchema>;

export const verifyCodeRequestSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${CLIENT_OTP_LENGTH}}$`), `Enter the ${CLIENT_OTP_LENGTH}-digit code`),
});
export type VerifyCodeRequest = z.infer<typeof verifyCodeRequestSchema>;

// ---------------------------------------------------------------------------------------------
// Signed in as a client
// ---------------------------------------------------------------------------------------------

/** What the portal shows about the signed-in client and their trainer (allow-listed fields). */
export const clientMeResponseSchema = z.object({
  client: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    firstName: z.string(),
  }),
  trainer: z.object({
    displayName: z.string(),
    avatarUrl: z.string().url().nullable(),
    /** For "Contact trainer" (WhatsApp / call); null when the trainer hasn't added one. */
    phoneE164: z.string().max(16).nullable(),
  }),
  features: clientFeaturesSchema,
  workspace: z.object({
    name: z.string(),
    timezone: z.string(),
    /** Suspended workspaces are read-only (§16.0). */
    readOnly: z.boolean(),
  }),
});
export type ClientMeResponse = z.infer<typeof clientMeResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Client app screens (§9, step 4.2)
// ---------------------------------------------------------------------------------------------

const isoDate = z.string().regex(/^d{4}-d{2}-d{2}$/);

export const clientWorkoutSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  scheduledOn: isoDate,
  status: z.enum(WORKOUT_SESSION_STATUSES),
});
export type ClientWorkoutSummary = z.infer<typeof clientWorkoutSummarySchema>;

/** One of the client's own appointments: no notes, no cancel reasons (client view). */
export const clientAppointmentSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(APPOINTMENT_KINDS),
  status: z.enum(APPOINTMENT_STATUSES),
  startsAt: z.string().datetime(),
  /** Local to the workspace time zone. */
  date: isoDate,
  startTime: z.string(),
  endTime: z.string(),
  durationMin: z.number().int(),
  location: z.string().max(120).nullable(),
  meetingUrl: z.string().max(300).nullable(),
});
export type ClientAppointment = z.infer<typeof clientAppointmentSchema>;

export const clientHomeResponseSchema = z.object({
  /** Today in the workspace time zone. */
  today: isoDate,
  /** Monday to Sunday of this week. */
  week: z.array(
    z.object({
      date: isoDate,
      workouts: z.array(clientWorkoutSummarySchema),
      sessions: z.number().int(),
    }),
  ),
  todayWorkout: clientWorkoutSummarySchema.nullable(),
  nextSession: clientAppointmentSchema.nullable(),
  package: clientPortalPackageSchema.nullable(),
  /** Consecutive weeks (up to last week, plus this week once done) with every planned workout done. */
  streakWeeks: z.number().int(),
  /** Today is a check-in day and nothing is sent yet (§8.7). */
  checkInDue: z.boolean(),
  programName: z.string().max(80).nullable(),
});
export type ClientHomeResponse = z.infer<typeof clientHomeResponseSchema>;

export const portalWorkoutsResponseSchema = z.object({
  today: isoDate,
  upcoming: z.array(clientWorkoutSummarySchema),
  past: z.array(clientWorkoutSummarySchema),
});
export type PortalWorkoutsResponse = z.infer<typeof portalWorkoutsResponseSchema>;

/** A workout in the client app: trainer notes and trainer feedback are removed. */
export const clientWorkoutResponseSchema = z.object({
  workout: workoutDetailSchema,
  /** Self-logging is on for this client and the workout can be logged. */
  canLog: z.boolean(),
});
export type ClientWorkoutResponse = z.infer<typeof clientWorkoutResponseSchema>;

export const clientPortalScheduleResponseSchema = z.object({
  today: isoDate,
  timezone: z.string(),
  upcoming: z.array(clientAppointmentSchema),
  past: z.array(clientAppointmentSchema),
});
export type ClientPortalScheduleResponse = z.infer<typeof clientPortalScheduleResponseSchema>;

export const clientProfileResponseSchema = z.object({
  fullName: z.string(),
  email: z.string().max(254).nullable(),
  phoneE164: z.string().max(16).nullable(),
  preferredContact: z.enum(PREFERRED_CONTACTS).nullable(),
  units: z.object({ weightUnit: z.enum(WEIGHT_UNITS), lengthUnit: z.enum(LENGTH_UNITS) }),
  /** Read-only: set with the trainer. */
  goals: z.array(
    z.object({
      goal: z.enum(FITNESS_GOALS),
      targetText: z.string().max(200).nullable(),
      targetDate: isoDate.nullable(),
      primary: z.boolean(),
    }),
  ),
  package: clientPortalPackageSchema.nullable(),
});
export type ClientProfileResponse = z.infer<typeof clientProfileResponseSchema>;

export const updateClientPreferencesRequestSchema = z.object({
  preferredContact: z.enum(PREFERRED_CONTACTS).nullable(),
  weightUnit: z.enum(WEIGHT_UNITS),
  lengthUnit: z.enum(LENGTH_UNITS),
});
export type UpdateClientPreferencesRequest = z.infer<typeof updateClientPreferencesRequestSchema>;
