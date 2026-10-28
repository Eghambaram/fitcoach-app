/**
 * Metric definitions (PROMPT §8.1.1). One source for the API queries, the dashboard captions and
 * docs/metrics.md. Every date boundary is in the workspace time zone (CLAUDE.md rule 19).
 */

export const METRIC_KEYS = [
  "sessions_today",
  "active_clients",
  "new_leads",
  "follow_ups",
  "check_ins_to_review",
  "payments_due",
  "packages_expiring",
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export const METRIC_DEFINITIONS: Record<MetricKey, { label: string; definition: string }> = {
  sessions_today: {
    label: "Sessions today",
    definition:
      "Appointments of every kind starting today that are scheduled, confirmed or attended. Online = online sessions or ones with a meeting link; trials are counted separately in the caption.",
  },
  active_clients: {
    label: "Active clients",
    definition: "Clients whose status is Active (not paused, archived or still onboarding).",
  },
  new_leads: {
    label: "New leads",
    definition: "Leads created in the last 7 days, including today.",
  },
  follow_ups: {
    label: "Follow-ups due",
    definition:
      "Open follow-ups due by the end of today. Overdue = open follow-ups whose time has already passed.",
  },
  check_ins_to_review: {
    label: "Check-ins to review",
    definition: "Client check-ins you haven't marked reviewed yet.",
  },
  payments_due: {
    label: "Payments due",
    definition:
      "Active packages with money still owed whose payment due date is today or earlier (recorded payments, net of voids).",
  },
  packages_expiring: {
    label: "Packages expiring",
    definition:
      "Active packages with sessions left at or below your threshold, or expiring within your warning days (Settings → Packages).",
  },
};

/** "Needs attention" groups, in the order of PROMPT §8.1. */
export const ATTENTION_KINDS = [
  "follow_up_overdue",
  "follow_up_today",
  "trial_soon",
  "payment_due",
  "package_low",
  "check_in_review",
  "attendance",
  "no_check_in",
  "no_measurement",
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

export const ATTENTION_LABELS: Record<AttentionKind, string> = {
  follow_up_overdue: "Overdue follow-ups",
  follow_up_today: "Follow-ups due today",
  trial_soon: "Trials in the next 48 hours",
  payment_due: "Payments due",
  package_low: "Packages running low or expiring",
  check_in_review: "Check-ins to review",
  attendance: "Sessions to mark attended",
  no_check_in: "No recent check-in",
  no_measurement: "No recent measurement",
};

/** Window for trials coming up, in hours. */
export const TRIAL_SOON_HOURS = 48;
/** Past sessions still to mark are looked for this far back. */
export const ATTENDANCE_LOOKBACK_DAYS = 60;
/** At most this many items per "Needs attention" group (the count shows the rest). */
export const ATTENTION_GROUP_LIMIT = 5;
