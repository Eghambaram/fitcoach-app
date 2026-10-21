import { z } from "zod";
import { normalizePhone } from "../phone";
import { COACHING_MODES, emailSchema } from "./auth";
import { FITNESS_GOALS, PUBLIC_LEAD_SOURCES } from "./leads";

/** The public enquiry page `/coach/[slug]` and its form (PROMPT §8.2). */

/** How the enquiry form treats email. Name, phone, goal and consent are always asked. */
export const ENQUIRY_EMAIL_MODES = ["hidden", "optional", "required"] as const;
export type EnquiryEmailMode = (typeof ENQUIRY_EMAIL_MODES)[number];

export const enquiryFormFieldsSchema = z.object({
  email: z.enum(ENQUIRY_EMAIL_MODES),
  /** "Preferred days and times". */
  schedule: z.boolean(),
  message: z.boolean(),
});
export type EnquiryFormFields = z.infer<typeof enquiryFormFieldsSchema>;

export const DEFAULT_ENQUIRY_FORM_FIELDS: EnquiryFormFields = {
  email: "optional",
  schedule: true,
  message: true,
};

/**
 * The consent every new workspace starts with (version 1). Trainers can reword it; each change is a
 * new version, and every lead records the exact version it agreed to.
 */
export const DEFAULT_CONSENT_TEXT =
  "I agree that this coach may contact me by phone, WhatsApp or email about my enquiry, and keep the details I share here for that purpose. I can ask for them to be deleted at any time.";

/**
 * Time-to-submit: the API ignores enquiries sent back sooner than this after the page was served
 * (bots). The form waits out any remaining time itself, so a fast human is never dropped.
 */
export const ENQUIRY_MIN_FILL_MS = 3_000;

export const CONSENT_TEXT_MIN = 20;
export const CONSENT_TEXT_MAX = 1000;

/**
 * Whitelisted fields of a published page — all the public read model exposes.
 * Top-level nullable strings carry a length cap on purpose: a bare `z.string().nullable()` reaches
 * Nest's swagger metadata as `type: ["string", "null"]` and is misread as an array.
 */
export const publicPageResponseSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  businessName: z.string(),
  headline: z.string().max(120).nullable(),
  bio: z.string().max(1000).nullable(),
  location: z.string().max(120).nullable(),
  coachingTypes: z.array(z.string()),
  coachingModes: z.array(z.enum(COACHING_MODES)),
  avatarUrl: z.string().url().nullable(),
  form: z.object({
    version: z.number().int().positive(),
    consentText: z.string(),
    fields: enquiryFormFieldsSchema,
  }),
  /** Signed issue time; the API refuses enquiries sent back too quickly (time-to-submit). */
  formToken: z.string(),
});
export type PublicPageResponse = z.infer<typeof publicPageResponseSchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional();

/**
 * The enquiry form. Which optional fields apply depends on the trainer's form settings; the API
 * enforces those (e.g. a required email) on top of this shape.
 */
export const enquiryRequestSchema = z.object({
  slug: z.string().trim().toLowerCase().min(3).max(40),
  fullName: z.string().trim().min(2, "Enter your name").max(80, "Use at most 80 characters"),
  phone: z
    .string()
    .trim()
    .min(1, "Enter your phone number")
    .max(32)
    .refine((value) => normalizePhone(value) !== null, "Enter a valid phone number"),
  email: z.union([z.literal(""), emailSchema]).optional(),
  goal: z.enum(FITNESS_GOALS, "Choose your main goal"),
  /** null/absent = no preference (an untouched radio group reports null). */
  preferredMode: z.enum(COACHING_MODES).nullish(),
  preferredSchedule: optionalText(200),
  message: optionalText(1000),
  /** From `?src=`; anything unknown counts as the plain enquiry page. */
  source: z.enum(PUBLIC_LEAD_SOURCES).catch("public_page").default("public_page"),
  utm: z
    .object({
      source: optionalText(100),
      medium: optionalText(100),
      campaign: optionalText(100),
      content: optionalText(100),
      term: optionalText(100),
    })
    .optional(),
  consent: z.literal(true, "Please agree so the coach can contact you"),
  consentVersion: z.number().int().positive(),
  formToken: z.string().min(1).max(200),
  /** Honeypot: hidden from people, filled in by bots. Never shown, never stored. */
  website: z.string().max(200).optional(),
  /** Cloudflare Turnstile response, when the site key is configured. */
  turnstileToken: z.string().max(2048).optional(),
});
export type EnquiryRequest = z.infer<typeof enquiryRequestSchema>;
export type EnquiryInput = z.input<typeof enquiryRequestSchema>;
