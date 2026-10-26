import {
  BASELINE_MEASUREMENTS,
  type CoachingMode,
  type ExperienceLevel,
  type FinalizeOnboardingInput,
  type FinalizeOnboardingRequest,
  finalizeOnboardingRequestSchema,
  type FitnessGoal,
  type OnboardingDraftData,
  onboardingDraftDataSchema,
  onboardingFieldsSchema,
  type PreferredContact,
} from "@fitcoach/shared";

/** The wizard's form values: what inputs hold (text for numbers, "" for empty selects). */
export interface WizardValues {
  fullName: string;
  phone: string;
  email: string;
  preferredContact: PreferredContact | "";
  dob: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  primaryGoal: FitnessGoal | "";
  secondaryGoals: FitnessGoal[];
  trainingMode: CoachingMode | "";
  location: string;
  preferredSchedule: string;
  experience: ExperienceLevel | "";
  equipment: string;
  coachingStartOn: string;
  measuredOn: string;
  weight: string;
  height: string;
  body_fat: string;
  waist: string;
  chest: string;
  hips: string;
  limitations: string;
  consentDataProcessing: boolean;
  consentProgressPhotos: boolean;
}

export type WizardField = keyof WizardValues;

/** Which step each field lives on (1-based), to jump to the first problem. */
export const STEP_FIELDS: Record<1 | 2 | 3, readonly WizardField[]> = {
  1: [
    "fullName",
    "phone",
    "email",
    "preferredContact",
    "dob",
    "emergencyContactName",
    "emergencyContactPhone",
    "emergencyContactRelation",
  ],
  2: [
    "primaryGoal",
    "secondaryGoals",
    "trainingMode",
    "location",
    "preferredSchedule",
    "experience",
    "equipment",
    "coachingStartOn",
  ],
  3: [
    "measuredOn",
    ...BASELINE_MEASUREMENTS,
    "limitations",
    "consentDataProcessing",
    "consentProgressPhotos",
  ],
};

export function stepOf(field: string): 1 | 2 | 3 {
  for (const step of [1, 2, 3] as const) {
    if ((STEP_FIELDS[step] as readonly string[]).includes(field)) return step;
  }
  return 1;
}

export function fromDraftData(data: OnboardingDraftData): WizardValues {
  const number = (value: number | undefined) => (value === undefined ? "" : String(value));
  return {
    fullName: data.fullName ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    preferredContact: data.preferredContact ?? "",
    dob: data.dob ?? "",
    emergencyContactName: data.emergencyContactName ?? "",
    emergencyContactPhone: data.emergencyContactPhone ?? "",
    emergencyContactRelation: data.emergencyContactRelation ?? "",
    primaryGoal: data.primaryGoal ?? "",
    secondaryGoals: data.secondaryGoals ?? [],
    trainingMode: data.trainingMode ?? "",
    location: data.location ?? "",
    preferredSchedule: data.preferredSchedule ?? "",
    experience: data.experience ?? "",
    equipment: data.equipment ?? "",
    coachingStartOn: data.coachingStartOn ?? "",
    measuredOn: data.measuredOn ?? "",
    weight: number(data.weight),
    height: number(data.height),
    body_fat: number(data.body_fat),
    waist: number(data.waist),
    chest: number(data.chest),
    hips: number(data.hips),
    limitations: data.limitations ?? "",
    consentDataProcessing: data.consentDataProcessing ?? false,
    consentProgressPhotos: data.consentProgressPhotos ?? false,
  };
}

/**
 * Form values without the empty ones, numbers parsed. Text that isn't a number is dropped for a
 * draft, but kept for validation so the field says "Enter a number".
 */
function compact(values: WizardValues, keepInvalid = false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === "" || value === undefined) continue;
    if ((BASELINE_MEASUREMENTS as readonly string[]).includes(key)) {
      const number = Number(String(value).replace(",", "."));
      if (Number.isFinite(number)) out[key] = number;
      else if (keepInvalid) out[key] = value;
      continue;
    }
    out[key] = typeof value === "string" ? value.trim() : value;
  }
  return out;
}

/** What "Save as draft" stores: anything typed so far that still fits the draft shape. */
export function toDraftData(values: WizardValues): OnboardingDraftData {
  const data = compact(values);
  const parsed = onboardingDraftDataSchema.safeParse(data);
  if (parsed.success) return parsed.data;
  // Drop only the fields that don't fit (e.g. a 2,000-character note), keep the rest.
  const bad = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
  return onboardingDraftDataSchema.parse(
    Object.fromEntries(Object.entries(data).filter(([key]) => !bad.has(key))),
  );
}

/** The fields as the API validates them, for one step or for Create. */
export function toFields(values: WizardValues): Record<string, unknown> {
  return compact(values, true);
}

export type FieldProblems = Partial<Record<WizardField, string>>;

/** Problems with the given step's fields (or all of them), using the shared schema. */
export function problemsFor(values: WizardValues, step?: 1 | 2 | 3): FieldProblems {
  const fields = step ? STEP_FIELDS[step] : undefined;
  const schema = fields
    ? onboardingFieldsSchema.pick(
        Object.fromEntries(fields.map((field) => [field, true])) as Record<WizardField, true>,
      )
    : onboardingFieldsSchema;
  const result = schema.safeParse(toFields(values));
  const problems: FieldProblems = {};
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = String(issue.path[0]) as WizardField;
      problems[field] ??= issue.message;
    }
  }
  return problems;
}

/** The Create body, parsed by the shared schema (call after `problemsFor` reports nothing). */
export function finalizeBody(
  values: WizardValues,
  extra: Pick<FinalizeOnboardingInput, "draftId" | "clientId" | "units" | "initialPackage">,
): FinalizeOnboardingRequest {
  return finalizeOnboardingRequestSchema.parse({ ...toFields(values), ...extra });
}
