import { z } from "zod";
import { WORKSPACE_STATUSES } from "./auth";
import { dependencyStatusSchema } from "./health";

/** Platform owner area (PROMPT §16.0, step 6.1). Aggregates and trainer accounts; no client PII. */

// ---------------------------------------------------------------------------------------------
// Login and MFA (§12.2): password, then a TOTP code. Sessions reach AAL2 only after the code.
// ---------------------------------------------------------------------------------------------

export const platformLoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: z.string().min(1, "Enter your password").max(200),
});
export type PlatformLoginRequest = z.infer<typeof platformLoginRequestSchema>;

/** What the signed-in (AAL1) platform session must do next. */
export const platformLoginResponseSchema = z.object({
  next: z.enum(["mfa_setup", "mfa_verify"]),
});
export type PlatformLoginResponse = z.infer<typeof platformLoginResponseSchema>;

/** Where a signed-in platform session stands: AAL2 is in; otherwise set up or verify MFA. */
export const platformAuthStatusSchema = z.object({
  aal: z.union([z.literal(1), z.literal(2)]),
  mfaEnabled: z.boolean(),
});
export type PlatformAuthStatus = z.infer<typeof platformAuthStatusSchema>;

export const PLATFORM_RECOVERY_CODE_COUNT = 10;

export const platformMfaSetupResponseSchema = z.object({
  /** Base32, for typing into an authenticator by hand. */
  secret: z.string().max(64),
  otpauthUri: z.string().max(500),
  /** The otpauth URI as an SVG QR code. */
  qrSvg: z.string().max(100_000),
});
export type PlatformMfaSetupResponse = z.infer<typeof platformMfaSetupResponseSchema>;

const totpCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app");

export const platformMfaEnableRequestSchema = z.object({ code: totpCode });
export type PlatformMfaEnableRequest = z.infer<typeof platformMfaEnableRequestSchema>;

export const platformMfaEnableResponseSchema = z.object({
  /** Shown once. Each works one time instead of a code. */
  recoveryCodes: z.array(z.string().max(20)).length(PLATFORM_RECOVERY_CODE_COUNT),
});
export type PlatformMfaEnableResponse = z.infer<typeof platformMfaEnableResponseSchema>;

/** Exactly one of: the authenticator code, or a recovery code. */
export const platformMfaVerifyRequestSchema = z
  .object({
    code: totpCode.optional(),
    recoveryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{5}-?[A-Z0-9]{5}$/, "Enter a recovery code like ABCDE-12345")
      .optional(),
  })
  .refine((value) => (value.code === undefined) !== (value.recoveryCode === undefined), {
    path: ["code"],
    message: "Enter the code from your authenticator app",
  });
export type PlatformMfaVerifyRequest = z.infer<typeof platformMfaVerifyRequestSchema>;

// ---------------------------------------------------------------------------------------------
// Overview (§16.0): real counts only. No revenue — billing isn't configured in the MVP.
// ---------------------------------------------------------------------------------------------

export const platformOverviewSchema = z.object({
  trainers: z.object({
    total: z.number().int(),
    activeThisWeek: z.number().int(),
    suspended: z.number().int(),
    pendingApproval: z.number().int(),
  }),
  activeClients: z.number().int(),
  /** §1A.5 activation among trainers who signed up 7+ days ago. null when nobody qualifies yet. */
  activation: z.object({
    eligible: z.number().int(),
    activated: z.number().int(),
    rate: z.number().min(0).max(1).nullable(),
  }),
  invitesAccepted: z.number().int(),
  feedbackOpen: z.number().int(),
  failedJobs24h: z.number().int(),
  recentSignups: z.array(
    z.object({
      workspaceId: z.string().uuid(),
      businessName: z.string().max(80),
      ownerName: z.string().max(80),
      status: z.enum(WORKSPACE_STATUSES),
      createdAt: z.string().datetime(),
    }),
  ),
});
export type PlatformOverview = z.infer<typeof platformOverviewSchema>;

// ---------------------------------------------------------------------------------------------
// Trainers
// ---------------------------------------------------------------------------------------------

export const TRAINER_SORTS = ["newest", "oldest", "last_active"] as const;

export const platformTrainerQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(WORKSPACE_STATUSES).optional(),
  sort: z.enum(TRAINER_SORTS).default("newest"),
});
export type PlatformTrainerQuery = z.infer<typeof platformTrainerQuerySchema>;

export const platformTrainerSchema = z.object({
  workspaceId: z.string().uuid(),
  businessName: z.string().max(80),
  slug: z.string().max(40),
  ownerName: z.string().max(80),
  ownerEmail: z.string().max(254).nullable(),
  status: z.enum(WORKSPACE_STATUSES),
  city: z.string().max(80).nullable(),
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime().nullable(),
  activeClients: z.number().int(),
});
export type PlatformTrainer = z.infer<typeof platformTrainerSchema>;

export const platformTrainerListResponseSchema = z.object({
  items: z.array(platformTrainerSchema),
  /** The list shows at most this many; refine the search for more. */
  limit: z.number().int(),
});
export type PlatformTrainerListResponse = z.infer<typeof platformTrainerListResponseSchema>;

export const platformTrainerDetailSchema = platformTrainerSchema.extend({
  emailVerified: z.boolean(),
  timezone: z.string().max(64),
  checklist: z.object({
    publicPagePublished: z.boolean(),
    hasLeadOrClient: z.boolean(),
    programAssigned: z.boolean(),
    clientInvited: z.boolean(),
  }),
  plan: z
    .object({
      planId: z.string().max(40),
      planName: z.string().max(80),
      maxActiveClients: z.number().int(),
      trialEndsAt: z.string().datetime().nullable(),
    })
    .nullable(),
  /** Counts only — never client names or details (§16.0). */
  usage: z.object({
    leads: z.number().int(),
    clients: z.number().int(),
    appointments: z.number().int(),
    workouts: z.number().int(),
  }),
  activeSessions: z.number().int(),
  plans: z.array(z.object({ id: z.string().max(40), name: z.string().max(80) })),
});
export type PlatformTrainerDetail = z.infer<typeof platformTrainerDetailSchema>;

export const platformReasonSchema = z.object({
  reason: z.string().trim().min(3, "Give a short reason").max(500),
});
export type PlatformReason = z.infer<typeof platformReasonSchema>;

export const platformPlanUpdateSchema = z.object({
  planId: z.string().regex(/^[a-z0-9_]{2,40}$/, "Choose a plan"),
  maxActiveClients: z.coerce
    .number()
    .int("Use a whole number")
    .min(1, "At least 1")
    .max(10_000, "At most 10,000"),
  /** YYYY-MM-DD (end of that day, workspace time), or null for no trial end. */
  trialEndsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date")
    .nullable(),
});
export type PlatformPlanUpdate = z.infer<typeof platformPlanUpdateSchema>;
export type PlatformPlanUpdateInput = z.input<typeof platformPlanUpdateSchema>;

// ---------------------------------------------------------------------------------------------
// Beta invites (ADR-0029)
// ---------------------------------------------------------------------------------------------

export const betaInviteSchema = z.object({
  id: z.string().uuid(),
  label: z.string().max(80).nullable(),
  uses: z.number().int(),
  maxUses: z.number().int(),
  expiresAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  status: z.enum(["active", "used_up", "expired", "revoked"]),
});
export type BetaInvite = z.infer<typeof betaInviteSchema>;

export const createBetaInviteRequestSchema = z.object({
  label: z.string().trim().max(80).optional(),
  maxUses: z.coerce.number().int().min(1, "At least 1").max(500, "At most 500"),
  expiresInDays: z.coerce.number().int().min(1, "At least 1 day").max(365, "At most a year"),
});
export type CreateBetaInviteRequest = z.infer<typeof createBetaInviteRequestSchema>;
export type CreateBetaInviteInput = z.input<typeof createBetaInviteRequestSchema>;

export const createBetaInviteResponseSchema = z.object({
  /** Shown once; only its HMAC is stored. */
  code: z.string().max(20),
  invite: betaInviteSchema,
});
export type CreateBetaInviteResponse = z.infer<typeof createBetaInviteResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Feedback inbox
// ---------------------------------------------------------------------------------------------

export const FEEDBACK_STATUSES = ["open", "triaged", "closed"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const platformFeedbackQuerySchema = z.object({
  status: z.enum(FEEDBACK_STATUSES).optional(),
});

export const platformFeedbackSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  businessName: z.string().max(80),
  trainerName: z.string().max(80).nullable(),
  page: z.string().max(200).nullable(),
  message: z.string().max(2000),
  status: z.enum(FEEDBACK_STATUSES),
  createdAt: z.string().datetime(),
});
export type PlatformFeedback = z.infer<typeof platformFeedbackSchema>;

export const platformFeedbackListResponseSchema = z.object({
  items: z.array(platformFeedbackSchema),
  counts: z.object({ open: z.number().int(), triaged: z.number().int(), closed: z.number().int() }),
});
export type PlatformFeedbackListResponse = z.infer<typeof platformFeedbackListResponseSchema>;

export const platformFeedbackUpdateSchema = z.object({ status: z.enum(FEEDBACK_STATUSES) });
export type PlatformFeedbackUpdate = z.infer<typeof platformFeedbackUpdateSchema>;

// ---------------------------------------------------------------------------------------------
// Health (§16.0): each check is OK / Degraded / Unknown (or Not configured), with a short detail.
// ---------------------------------------------------------------------------------------------

export const healthItemSchema = z.object({
  status: dependencyStatusSchema,
  detail: z.string().max(300),
});
export type HealthItem = z.infer<typeof healthItemSchema>;

export const platformHealthSchema = z.object({
  checkedAt: z.string().datetime(),
  database: healthItemSchema,
  jobs: healthItemSchema,
  backups: healthItemSchema,
  email: healthItemSchema,
  storage: healthItemSchema,
  storageBudget: healthItemSchema.extend({
    usedBytes: z.number().int().nullable(),
    budgetBytes: z.number().int().nullable(),
    hardLimitBytes: z.number().int().nullable(),
  }),
  /** The in-API backup can be run now (ADR-0064); false with the external service or when unset. */
  canRunBackup: z.boolean(),
  failedJobs: z.array(
    z.object({
      name: z.string().max(80),
      startedAt: z.string().datetime(),
      error: z.string().max(1000).nullable(),
    }),
  ),
});
export type PlatformHealth = z.infer<typeof platformHealthSchema>;

// ---------------------------------------------------------------------------------------------
// Audit logs (immutable)
// ---------------------------------------------------------------------------------------------

export const AUDIT_PAGE_SIZE = 50;

export const platformAuditQuerySchema = z.object({
  action: z
    .string()
    .trim()
    .regex(/^[a-z_.]{1,80}$/, "Use an action name like workspace.suspended")
    .optional(),
  actorKind: z.enum(["trainer", "client", "platform_owner", "system", "cli"]).optional(),
  workspaceId: z.string().uuid().optional(),
  /** Cursor: the `occurredAt|id` of the last row of the previous page. */
  before: z.string().max(80).optional(),
});
export type PlatformAuditQuery = z.infer<typeof platformAuditQuerySchema>;

export const platformAuditEntrySchema = z.object({
  id: z.string().uuid(),
  occurredAt: z.string().datetime(),
  actorKind: z.string().max(20),
  actorName: z.string().max(80).nullable(),
  workspaceId: z.string().uuid().nullable(),
  businessName: z.string().max(80).nullable(),
  action: z.string().max(80),
  targetType: z.string().max(40).nullable(),
  targetId: z.string().max(80).nullable(),
  reason: z.string().max(500).nullable(),
});
export type PlatformAuditEntry = z.infer<typeof platformAuditEntrySchema>;

export const platformAuditListResponseSchema = z.object({
  items: z.array(platformAuditEntrySchema),
  nextCursor: z.string().max(80).nullable(),
});
export type PlatformAuditListResponse = z.infer<typeof platformAuditListResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Backup heartbeat (step 6.2, PROMPT §17.2): the nightly db-backup cron reports each run.
// ---------------------------------------------------------------------------------------------

export const backupHeartbeatSchema = z
  .object({
    status: z.enum(["succeeded", "failed"]),
    /** e.g. `backups/daily/2026-10-28.dump` (with the environment's key prefix, if any). */
    objectKey: z
      .string()
      .regex(/^([a-z0-9-]+\/)?backups\/(daily|weekly)\/[A-Za-z0-9._-]+$/, "A backups/ object key")
      .max(200)
      .optional(),
    sizeBytes: z.number().int().positive().optional(),
    startedAt: z.string().datetime(),
    finishedAt: z.string().datetime(),
    /** Short, secret-free reason for a failure. */
    error: z.string().max(1000).optional(),
  })
  .refine(
    (value) =>
      value.status === "failed" || (value.objectKey !== undefined && value.sizeBytes !== undefined),
    { path: ["objectKey"], message: "A successful backup has an object key and a size" },
  );
export type BackupHeartbeat = z.infer<typeof backupHeartbeatSchema>;
