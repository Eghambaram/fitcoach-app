/**
 * WhatsApp click-to-chat message templates (PROMPT §8.12, D20). One template per purpose per workspace.
 * Defaults ship as reference rows in the migrations and are copied into each new workspace at signup.
 */
export const MESSAGE_TEMPLATE_PURPOSES = [
  "follow_up",
  "trial_confirmation",
  "client_invite",
  "payment_reminder",
  "package_renewal",
  "check_in_nudge",
  "session_reminder",
] as const;

export type MessageTemplatePurpose = (typeof MESSAGE_TEMPLATE_PURPOSES)[number];

/** The only placeholders a template may use; unknown ones are rejected on save (step 2.1). */
export const MESSAGE_TEMPLATE_PLACEHOLDERS = [
  "first_name",
  "trainer_name",
  "date",
  "time",
  "link",
  "sessions_left",
  "amount_due",
  "package_name",
] as const;

export type MessageTemplatePlaceholder = (typeof MESSAGE_TEMPLATE_PLACEHOLDERS)[number];

/** Package kinds (PROMPT §8.3A). */
export const PACKAGE_KINDS = ["session_pack", "time_based", "online_coaching"] as const;
export type PackageKind = (typeof PACKAGE_KINDS)[number];
