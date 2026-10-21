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

const PLACEHOLDER_TOKEN = /\{([^{}]*)\}/g;

/**
 * Placeholders in a template body that aren't in MESSAGE_TEMPLATE_PLACEHOLDERS, e.g. "{name}" or
 * "{First_Name}". Saving a template with any of these is refused (PROMPT §8.12).
 */
export function findUnknownPlaceholders(body: string): string[] {
  const known = new Set<string>(MESSAGE_TEMPLATE_PLACEHOLDERS);
  const unknown = new Set<string>();
  for (const [, name = ""] of body.matchAll(PLACEHOLDER_TOKEN)) {
    if (!known.has(name)) unknown.add(`{${name}}`);
  }
  return [...unknown];
}

/** Fills known placeholders; ones without a value stay as written so the trainer can see the gap. */
export function renderTemplate(
  body: string,
  values: Partial<Record<MessageTemplatePlaceholder, string>>,
): string {
  return body.replace(PLACEHOLDER_TOKEN, (token, name: string) => {
    const value = values[name as MessageTemplatePlaceholder];
    return value === undefined ? token : value;
  });
}
