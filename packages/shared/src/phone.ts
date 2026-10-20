import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js";
import { DEFAULT_COUNTRY } from "./defaults";

/**
 * Normalises a phone number to E.164 ("+919876543210") using the workspace's default country for
 * national-format input. Returns null when it isn't a valid number. Do this before any duplicate check.
 */
export function normalizePhone(
  input: string,
  defaultCountry: string = DEFAULT_COUNTRY,
): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), defaultCountry as CountryCode);
  return parsed?.isValid() ? parsed.number : null;
}

/** `wa.me` links need the E.164 number without "+" or spaces (CLAUDE.md gotchas). */
export function toWhatsAppNumber(e164: string): string {
  return e164.replace(/\D/g, "");
}
