/**
 * Product events for the beta metrics (PROMPT §1A.5, §10.2, ADR-0030). Properties must never contain
 * PII: no names, emails, phones, free text or health data — only ids, counts, enums and booleans.
 * Each step adds the events its feature needs; step 5.3 audits coverage against every metric.
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
] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

export type ProductEventProperties = Record<string, string | number | boolean | null>;
