/**
 * Product events for the beta metrics (PROMPT §1A.5, §10.2, ADR-0030). Properties must never contain
 * PII: no names, emails, phones, free text or health data — only ids, counts, enums and booleans.
 * Coverage of every §1A.5 metric is mapped in docs/metrics.md (step 5.3).
 */
export const PRODUCT_EVENTS = [
  "trainer_signed_up",
  "email_verified",
  // Activation: public page published (§1A.5).
  "public_page_published",
  // Lead capture used: an enquiry arrived through the public page (§1A.5).
  "lead_captured",
  // Lead conversion rate (§1A.5): a lead became (or was linked to) a client.
  "lead_converted",
  // Client onboarding completed (§1A.5 activation: first client onboarded).
  "client_onboarded",
  // Lead → trial funnel (§1A.5): a trial session was booked for a lead.
  "trial_booked",
  // Packages used (§1A.5, §8.3A): a package was sold or renewed / a payment was recorded.
  "package_sold",
  "payment_recorded",
  // Activation (§1A.5): ≥ 1 program assigned.
  "program_assigned",
  // Weekly active trainer / retention (§1A.5): sessions attended and workouts logged.
  "session_attended",
  "workout_completed",
  // Client engagement (§1A.5): invited clients and their check-ins.
  "client_invited",
  "client_invite_accepted",
  "check_in_submitted",
  // Beta operations (step 5.3).
  "feedback_sent",
  "data_exported",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

export type ProductEventProperties = Record<string, string | number | boolean | null>;
