import type { CoachingMode } from "./auth";

/** Lead CRM vocabulary (PROMPT §8.2). The database CHECKs mirror these lists. */

export const LEAD_STAGES = [
  "new",
  "contacted",
  "trial_booked",
  "interested",
  "converted",
  "lost",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Where a lead came from. `public_page` and `qr` and the social sources arrive through the enquiry page. */
export const LEAD_SOURCES = [
  "public_page",
  "qr",
  "instagram",
  "whatsapp",
  "facebook",
  "google",
  "website",
  "referral",
  "walk_in",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Sources an enquiry-page link may carry in `?src=` (walk-ins are only ever added by hand). */
export const PUBLIC_LEAD_SOURCES = [
  "public_page",
  "qr",
  "instagram",
  "whatsapp",
  "facebook",
  "google",
  "website",
  "referral",
  "other",
] as const satisfies readonly LeadSource[];
export type PublicLeadSource = (typeof PUBLIC_LEAD_SOURCES)[number];

/** Per-source links offered on the share screen (QR has its own download). */
export const SHARE_LINK_SOURCES = [
  "instagram",
  "whatsapp",
  "facebook",
  "google",
  "website",
] as const satisfies readonly PublicLeadSource[];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  public_page: "Enquiry page",
  qr: "QR code",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  google: "Google",
  website: "Website",
  referral: "Referral",
  walk_in: "Walk-in",
  other: "Other",
};

export const FITNESS_GOALS = [
  "lose_weight",
  "build_muscle",
  "get_stronger",
  "improve_fitness",
  "sports_performance",
  "other",
] as const;
export type FitnessGoal = (typeof FITNESS_GOALS)[number];

export const FITNESS_GOAL_LABELS: Record<FitnessGoal, string> = {
  lose_weight: "Lose weight",
  build_muscle: "Build muscle",
  get_stronger: "Get stronger",
  improve_fitness: "Improve overall fitness",
  sports_performance: "Sports performance",
  other: "Something else",
};

export const COACHING_MODE_LABELS: Record<CoachingMode, string> = {
  in_person: "In person",
  online: "Online",
  hybrid: "Hybrid",
};
