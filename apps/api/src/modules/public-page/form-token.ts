import { createHmac, timingSafeEqual } from "node:crypto";
import { ENQUIRY_MIN_FILL_MS } from "@fitcoach/shared";

/**
 * Time-to-submit for the public enquiry form (PROMPT §8.2). The page is served with a token that
 * signs its issue time for that workspace; an enquiry sent back sooner than a person could fill
 * the form in is treated as a bot. Signed with SESSION_SECRET, so the time can't be forged.
 */
export const MIN_FILL_MS = ENQUIRY_MIN_FILL_MS;
/** Long enough for an open tab; after that the visitor is asked to reload. */
export const MAX_FORM_AGE_MS = 24 * 60 * 60 * 1000;

export type FormTokenCheck = "ok" | "invalid" | "too_fast" | "expired";

function signature(secret: string, workspaceId: string, issuedAt: string): string {
  return createHmac("sha256", secret)
    .update(`enquiry-form:${workspaceId}:${issuedAt}`)
    .digest("base64url");
}

export function issueFormToken(secret: string, workspaceId: string, now = Date.now()): string {
  const issuedAt = String(now);
  return `${issuedAt}.${signature(secret, workspaceId, issuedAt)}`;
}

export function checkFormToken(
  secret: string,
  workspaceId: string,
  token: string,
  now = Date.now(),
): FormTokenCheck {
  const [issuedAt = "", given = "", extra] = token.split(".");
  if (extra !== undefined || !/^\d{13}$/.test(issuedAt)) return "invalid";
  const expected = Buffer.from(signature(secret, workspaceId, issuedAt));
  const actual = Buffer.from(given);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return "invalid";
  const age = now - Number(issuedAt);
  if (age < MIN_FILL_MS) return "too_fast";
  if (age > MAX_FORM_AGE_MS) return "expired";
  return "ok";
}
