import { z } from "zod";
import { normalizePhone } from "../phone";
import { COACHING_MODES, emailSchema } from "./auth";
import { FITNESS_GOALS } from "./leads";
import { initialPackageSchema } from "./packages";
import { LENGTH_UNITS, WEIGHT_UNITS } from "./settings";

/** Add Client onboarding wizard (PROMPT §8.4, step 2.5). */

export const ONBOARDING_STEPS = [
  "Basic information",
  "Goals & training",
  "Baseline & consent",
  "Review & create",
] as const;

export const PREFERRED_CONTACTS = ["whatsapp", "phone", "email"] as const;
export type PreferredContact = (typeof PREFERRED_CONTACTS)[number];
export const PREFERRED_CONTACT_LABELS: Record<PreferredContact, string> = {
  whatsapp: "WhatsApp",
  phone: "Phone",
  email: "Email",
};

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Beginner (new or returning to training)",
  intermediate: "Intermediate (trains regularly)",
  advanced: "Advanced (years of structured training)",
};

/** Baseline measurements the wizard offers, as seeded global `measurement_types` keys. */
export const BASELINE_MEASUREMENTS = [
  "weight",
  "height",
  "body_fat",
  "waist",
  "chest",
  "hips",
] as const;
export type BaselineMeasurement = (typeof BASELINE_MEASUREMENTS)[number];
export const MEASUREMENT_KINDS: Record<BaselineMeasurement, "mass" | "length" | "percent"> = {
  weight: "mass",
  height: "length",
  body_fat: "percent",
  waist: "length",
  chest: "length",
  hips: "length",
};
export const MEASUREMENT_LABELS: Record<BaselineMeasurement, string> = {
  weight: "Weight",
  height: "Height",
  body_fat: "Body fat %",
  waist: "Waist",
  chest: "Chest",
  hips: "Hips",
};
/** Plausible ranges in canonical units (kg, cm, %); anything outside is almost certainly a typo. */
export const MEASUREMENT_RANGES: Record<BaselineMeasurement, [number, number]> = {
  weight: [20, 350],
  height: [50, 250],
  body_fat: [2, 70],
  waist: [30, 250],
  chest: [40, 250],
  hips: [40, 250],
};

export const CONSENT_KINDS = ["data_processing", "progress_photos"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/**
 * Consent notices. Never edit a published version: add the next one and bump `current`. Each
 * `client_consents` row stores the version and the exact text shown.
 */
export const CONSENT_NOTICES: Record<ConsentKind, { version: number; text: string }> = {
  data_processing: {
    version: 1,
    text: "I have the client's consent to collect and use their contact details, goals, health-related notes and measurements to coach them. They can ask for a copy or for deletion at any time.",
  },
  progress_photos: {
    version: 1,
    text: "The client agrees that progress photos may be taken and stored privately for coaching. Photos are never shared without their permission.",
  },
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional();
const phone = z
  .string()
  .trim()
  .max(32)
  .refine((value) => value === "" || normalizePhone(value) !== null, "Enter a valid phone number")
  .optional();
const measurement = z
  .number("Enter a number")
  .positive("Enter a positive number")
  .max(1000, "That looks too large")
  .optional();
const today = () => new Date().toISOString().slice(0, 10);

/** Everything the wizard collects. Measurements are in `units`; the API converts to kg/cm. */
export const onboardingFieldsSchema = z.object({
  // 1. Basic information
  fullName: z.string("Enter a name").trim().min(1, "Enter a name").max(80),
  phone,
  email: z.union([z.literal(""), emailSchema]).optional(),
  preferredContact: z.enum(PREFERRED_CONTACTS).optional(),
  dob: isoDate.refine((value) => value <= today(), "Choose a date in the past").optional(),
  emergencyContactName: optionalText(80),
  emergencyContactPhone: phone,
  emergencyContactRelation: optionalText(40),
  // 2. Goals & training
  primaryGoal: z.enum(FITNESS_GOALS, "Choose a primary goal"),
  secondaryGoals: z.array(z.enum(FITNESS_GOALS)).max(5).default([]),
  trainingMode: z.enum(COACHING_MODES, "Choose a training mode"),
  location: optionalText(120),
  preferredSchedule: optionalText(200),
  experience: z.enum(EXPERIENCE_LEVELS).optional(),
  equipment: optionalText(200),
  coachingStartOn: isoDate.optional(),
  // 3. Baseline & consent
  measuredOn: isoDate.refine((value) => value <= today(), "Choose today or a past date").optional(),
  weight: measurement,
  height: measurement,
  body_fat: measurement,
  waist: measurement,
  chest: measurement,
  hips: measurement,
  limitations: optionalText(1000),
  consentDataProcessing: z.literal(true, "The client's consent to data processing is required"),
  consentProgressPhotos: z.boolean().default(false),
});
export type OnboardingFields = z.infer<typeof onboardingFieldsSchema>;
export type OnboardingFieldsInput = z.input<typeof onboardingFieldsSchema>;

export const measurementUnitsSchema = z.object({
  weightUnit: z.enum(WEIGHT_UNITS),
  lengthUnit: z.enum(LENGTH_UNITS),
});
export type MeasurementUnits = z.infer<typeof measurementUnitsSchema>;

/**
 * A saved draft: any subset of the fields, with only types and lengths checked, so "Save as draft"
 * works halfway through a step (§8.4).
 */
export const onboardingDraftDataSchema = z
  .object({
    fullName: z.string().max(80),
    phone: z.string().max(32),
    email: z.string().max(254),
    preferredContact: z.enum(PREFERRED_CONTACTS),
    dob: z.string().max(10),
    emergencyContactName: z.string().max(80),
    emergencyContactPhone: z.string().max(32),
    emergencyContactRelation: z.string().max(40),
    primaryGoal: z.enum(FITNESS_GOALS),
    secondaryGoals: z.array(z.enum(FITNESS_GOALS)).max(5),
    trainingMode: z.enum(COACHING_MODES),
    location: z.string().max(120),
    preferredSchedule: z.string().max(200),
    experience: z.enum(EXPERIENCE_LEVELS),
    equipment: z.string().max(200),
    coachingStartOn: z.string().max(10),
    measuredOn: z.string().max(10),
    weight: z.number().max(1000),
    height: z.number().max(1000),
    body_fat: z.number().max(1000),
    waist: z.number().max(1000),
    chest: z.number().max(1000),
    hips: z.number().max(1000),
    limitations: z.string().max(1000),
    consentDataProcessing: z.boolean(),
    consentProgressPhotos: z.boolean(),
  })
  .partial();
export type OnboardingDraftData = z.infer<typeof onboardingDraftDataSchema>;

export const onboardingStepSchema = z.number().int().min(1).max(ONBOARDING_STEPS.length);

/** Create a draft; `clientId` only for a client created by lead conversion. */
export const createOnboardingDraftRequestSchema = z.object({
  clientId: z.string().uuid().optional(),
  step: onboardingStepSchema,
  data: onboardingDraftDataSchema,
});
export type CreateOnboardingDraftRequest = z.infer<typeof createOnboardingDraftRequestSchema>;

export const saveOnboardingDraftRequestSchema = z.object({
  step: onboardingStepSchema,
  data: onboardingDraftDataSchema,
});
export type SaveOnboardingDraftRequest = z.infer<typeof saveOnboardingDraftRequestSchema>;

/** A draft as the wizard resumes it; `id` is null for an unsaved prefill (e.g. from a lead). */
export const onboardingDraftSchema = z.object({
  id: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable(),
  step: onboardingStepSchema,
  data: onboardingDraftDataSchema,
  updatedAt: z.string().datetime().nullable(),
  units: measurementUnitsSchema,
});
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

export const onboardingDraftsResponseSchema = z.object({
  drafts: z.array(
    z.object({
      id: z.string().uuid(),
      clientId: z.string().uuid().nullable(),
      fullName: z.string().max(80).nullable(),
      step: onboardingStepSchema,
      updatedAt: z.string().datetime(),
    }),
  ),
  units: measurementUnitsSchema,
});
export type OnboardingDraftsResponse = z.infer<typeof onboardingDraftsResponseSchema>;

/** `?fromLead=`: the converted client's draft (or a prefill), or a note that they're onboarded. */
export const onboardingFromLeadResponseSchema = z.object({
  status: z.enum(["onboarding", "onboarded"]),
  clientId: z.string().uuid(),
  fullName: z.string(),
  /** Set while onboarding: the open draft, or an unsaved prefill (`id: null`). */
  draft: onboardingDraftSchema.nullable(),
});
export type OnboardingFromLeadResponse = z.infer<typeof onboardingFromLeadResponseSchema>;

/** Create Client (step 4): the full, validated fields plus where they came from. */
export const finalizeOnboardingRequestSchema = onboardingFieldsSchema.extend({
  draftId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  units: measurementUnitsSchema,
  /** Optional package (§8.3A), sold in the same transaction. Refused if one is already active. */
  initialPackage: initialPackageSchema.optional(),
});
export type FinalizeOnboardingRequest = z.infer<typeof finalizeOnboardingRequestSchema>;
export type FinalizeOnboardingInput = z.input<typeof finalizeOnboardingRequestSchema>;

export const finalizeOnboardingResponseSchema = z.object({
  clientId: z.string().uuid(),
  fullName: z.string(),
  measurementsRecorded: z.number().int(),
});
export type FinalizeOnboardingResponse = z.infer<typeof finalizeOnboardingResponseSchema>;
