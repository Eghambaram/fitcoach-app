export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Common passwords that meet the length rule (PROMPT §12.2 "block common passwords").
 * Shorter common passwords are already rejected by the minimum length.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "1234567890",
  "0987654321",
  "12345678910",
  "123456789a",
  "1q2w3e4r5t",
  "1qaz2wsx3edc",
  "qwertyuiop",
  "qwerty1234",
  "qwerty12345",
  "asdfghjkl1",
  "zxcvbnm123",
  "password12",
  "password123",
  "password1234",
  "password@123",
  "passw0rd123",
  "iloveyou12",
  "iloveyou123",
  "welcome123",
  "welcome@123",
  "letmein123",
  "admin12345",
  "admin@1234",
  "abcdefghij",
  "abcd123456",
  "abc1234567",
  "india12345",
  "india@1234",
  "fitness123",
  "fitness@123",
  "fitcoach123",
  "trainer123",
  "changeme123",
]);

/** True when the password is on the blocklist or is one character repeated. */
export function isCommonPassword(password: string): boolean {
  const lowered = password.toLowerCase();
  return COMMON_PASSWORDS.has(lowered) || /^(.)\1+$/.test(password);
}
