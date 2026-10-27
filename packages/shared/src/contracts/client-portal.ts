import { z } from "zod";
import { emailSchema } from "./auth";
import { whatsAppLinkSchema } from "./follow-ups";

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
  }),
  workspace: z.object({
    name: z.string(),
    timezone: z.string(),
    /** Suspended workspaces are read-only (§16.0). */
    readOnly: z.boolean(),
  }),
});
export type ClientMeResponse = z.infer<typeof clientMeResponseSchema>;
