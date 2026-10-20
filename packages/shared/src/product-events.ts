/**
 * Product events for the beta metrics (PROMPT §1A.5, §10.2, ADR-0030). Properties must never contain
 * PII: no names, emails, phones, free text or health data — only ids, counts, enums and booleans.
 * Each step adds the events its feature needs; step 5.3 audits coverage against every metric.
 */
export const PRODUCT_EVENTS = ["trainer_signed_up", "email_verified"] as const;

export type ProductEventName = (typeof PRODUCT_EVENTS)[number];

export type ProductEventProperties = Record<string, string | number | boolean | null>;
