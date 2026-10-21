import { z } from "zod";
import { findUnknownPlaceholders, MESSAGE_TEMPLATE_PURPOSES, PACKAGE_KINDS } from "../messaging";
import { PASSWORD_MAX_LENGTH } from "../passwords";
import { COACHING_MODES, passwordSchema, slugSchema, timezoneSchema } from "./auth";
import {
  CONSENT_TEXT_MAX,
  CONSENT_TEXT_MIN,
  ENQUIRY_EMAIL_MODES,
  enquiryFormFieldsSchema,
} from "./public-page";

/** Trainer settings (PROMPT §8.12). One contract per section; each section saves on its own. */

// ---------------------------------------------------------------------------------------------
// Profile & public page
// ---------------------------------------------------------------------------------------------

export const COACHING_TYPES_MAX = 8;

const optionalLine = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).default("");

export const publicPageSettingsRequestSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name").max(80),
  businessName: z.string().trim().min(2, "Enter your business name").max(80),
  slug: slugSchema,
  headline: optionalLine(120),
  bio: optionalLine(1000),
  location: optionalLine(120),
  coachingTypes: z
    .array(z.string().trim().min(2, "Use at least 2 characters").max(40))
    .max(COACHING_TYPES_MAX, `Add at most ${COACHING_TYPES_MAX}`)
    .refine(
      (types) => new Set(types.map((type) => type.toLowerCase())).size === types.length,
      "Each type only once",
    ),
  coachingModes: z.array(z.enum(COACHING_MODES)).min(1, "Choose at least one").max(3),
  form: z.object({
    email: z.enum(ENQUIRY_EMAIL_MODES),
    schedule: z.boolean(),
    message: z.boolean(),
    consentText: z
      .string()
      .trim()
      .min(CONSENT_TEXT_MIN, `Use at least ${CONSENT_TEXT_MIN} characters`)
      .max(CONSENT_TEXT_MAX, `Use at most ${CONSENT_TEXT_MAX} characters`),
  }),
});
export type PublicPageSettingsRequest = z.infer<typeof publicPageSettingsRequestSchema>;
export type PublicPageSettingsInput = z.input<typeof publicPageSettingsRequestSchema>;

export const publicPageSettingsResponseSchema = z.object({
  displayName: z.string(),
  businessName: z.string(),
  slug: z.string(),
  headline: z.string(),
  bio: z.string(),
  location: z.string(),
  coachingTypes: z.array(z.string()),
  coachingModes: z.array(z.enum(COACHING_MODES)),
  avatarUrl: z.string().url().nullable(),
  form: enquiryFormFieldsSchema.extend({
    consentText: z.string(),
    /** Increments whenever the consent wording or form fields change. */
    version: z.number().int().positive(),
  }),
  isPublished: z.boolean(),
  publishedAt: z.string().datetime().nullable(),
  /** `https://<web origin>/coach/<slug>`. */
  publicUrl: z.string().url(),
});
export type PublicPageSettingsResponse = z.infer<typeof publicPageSettingsResponseSchema>;

export const publishRequestSchema = z.object({ published: z.boolean() });
export type PublishRequest = z.infer<typeof publishRequestSchema>;

export const QR_FORMATS = ["png", "svg"] as const;
export type QrFormat = (typeof QR_FORMATS)[number];

// ---------------------------------------------------------------------------------------------
// Units & locale, check-in & attention rules, package policy
// ---------------------------------------------------------------------------------------------

export const WEIGHT_UNITS = ["kg", "lb"] as const;
export const LENGTH_UNITS = ["cm", "in"] as const;
export const CHECK_IN_FREQUENCIES = ["daily", "weekly"] as const;

export const localeSettingsSchema = z.object({
  weightUnit: z.enum(WEIGHT_UNITS),
  lengthUnit: z.enum(LENGTH_UNITS),
  timezone: timezoneSchema,
  country: z.string().regex(/^[A-Z]{2}$/, "Choose a country"),
});
export type LocaleSettings = z.infer<typeof localeSettingsSchema>;

const wholeNumber = (min: number, max: number) =>
  z
    .number("Enter a number")
    .int("Use a whole number")
    .min(min, `Use ${min} or more`)
    .max(max, `Use ${max} or less`);

export const checkInRulesSchema = z.object({
  checkInFrequency: z.enum(CHECK_IN_FREQUENCIES),
  /** "Needs attention" after this many days without a check-in. */
  noCheckInDays: wholeNumber(1, 60),
  /** "Needs attention" after this many days without a measurement. */
  noMeasurementDays: wholeNumber(1, 180),
});
export type CheckInRules = z.infer<typeof checkInRulesSchema>;

/** No-show / late-cancel policy (D25) and package alert thresholds (§8.3A). */
export const packagePolicySchema = z.object({
  noShowUsesSession: z.boolean(),
  lateCancelWindowHours: wholeNumber(0, 168),
  lateCancelUsesSession: z.boolean(),
  lowSessionsThreshold: wholeNumber(0, 50),
  expiryWarningDays: wholeNumber(0, 60),
});
export type PackagePolicy = z.infer<typeof packagePolicySchema>;

export const workspaceSettingsResponseSchema = z.object({
  locale: localeSettingsSchema,
  checkIns: checkInRulesSchema,
  packagePolicy: packagePolicySchema,
  plan: z.object({
    planName: z.string(),
    maxActiveClients: z.number().int().positive(),
    trialEndsAt: z.string().datetime().nullable(),
  }),
});
export type WorkspaceSettingsResponse = z.infer<typeof workspaceSettingsResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------------------------

export const MESSAGE_TEMPLATE_BODY_MAX = 1000;

export const messageTemplateBodySchema = z
  .string()
  .trim()
  .min(1, "Write a message")
  .max(MESSAGE_TEMPLATE_BODY_MAX, `Use at most ${MESSAGE_TEMPLATE_BODY_MAX} characters`)
  .superRefine((body, ctx) => {
    const unknown = findUnknownPlaceholders(body);
    if (unknown.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Unknown placeholder${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`,
      });
    }
  });

export const messageTemplateUpdateSchema = z.object({ body: messageTemplateBodySchema });
export type MessageTemplateUpdate = z.infer<typeof messageTemplateUpdateSchema>;

export const messageTemplatePurposeSchema = z.enum(MESSAGE_TEMPLATE_PURPOSES);

export const messageTemplateSchema = z.object({
  purpose: messageTemplatePurposeSchema,
  body: z.string(),
  defaultBody: z.string(),
  isCustomised: z.boolean(),
});
export type MessageTemplate = z.infer<typeof messageTemplateSchema>;

export const messageTemplatesResponseSchema = z.object({
  templates: z.array(messageTemplateSchema),
});
export type MessageTemplatesResponse = z.infer<typeof messageTemplatesResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Package presets (§8.3A). Money is integer paise (CLAUDE.md rule 20a).
// ---------------------------------------------------------------------------------------------

/** ₹10,00,000 — far above any session package, low enough to catch a mistyped extra digit. */
export const MAX_PRESET_PRICE_PAISE = 100_000_000;

export const packagePresetInputSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(80),
    kind: z.enum(PACKAGE_KINDS),
    sessionsIncluded: wholeNumber(1, 500).nullable(),
    durationDays: wholeNumber(1, 730).nullable(),
    sessionsPerWeek: wholeNumber(1, 14).nullable(),
    defaultPricePaise: z
      .number()
      .int()
      .min(0, "Price can't be negative")
      .max(MAX_PRESET_PRICE_PAISE, "That price looks too high")
      .nullable(),
  })
  .superRefine((preset, ctx) => {
    if (preset.kind === "session_pack" && preset.sessionsIncluded === null) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionsIncluded"],
        message: "A session pack needs a number of sessions",
      });
    }
  });
export type PackagePresetInput = z.infer<typeof packagePresetInputSchema>;

export const packagePresetSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.enum(PACKAGE_KINDS),
  sessionsIncluded: z.number().int().nullable(),
  durationDays: z.number().int().nullable(),
  sessionsPerWeek: z.number().int().nullable(),
  defaultPricePaise: z.number().int().nullable(),
  archived: z.boolean(),
});
export type PackagePreset = z.infer<typeof packagePresetSchema>;

export const packagePresetsResponseSchema = z.object({ presets: z.array(packagePresetSchema) });
export type PackagePresetsResponse = z.infer<typeof packagePresetsResponseSchema>;

export const PACKAGE_KIND_LABELS = {
  session_pack: "Session pack",
  time_based: "Time-based (unlimited)",
  online_coaching: "Online coaching",
} as const;

// ---------------------------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------------------------

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    path: ["newPassword"],
    message: "Choose a password different from your current one",
  });
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
