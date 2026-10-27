import type { EmailMessage } from "./email-provider";

/**
 * Auth emails (PROMPT §8.10: auth emails only in the MVP). English, plain and short (D24).
 * Links always point at the web origin, never at the API.
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(
  heading: string,
  paragraphs: string[],
  action?: { label: string; url: string },
): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#C8F169;color:#18211D;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:600">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:13px;color:#6A736D">Or paste this link into your browser: ${escapeHtml(action.url)}</p>`
    : "";
  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#F6F7F3;color:#18201C;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-weight:700;letter-spacing:2px">FITCOACH</p>
    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>${body}${button}
  </div></body></html>`;
}

export function verifyEmailMessage(to: string, displayName: string, url: string): EmailMessage {
  const paragraphs = [
    `Hi ${displayName},`,
    "Confirm your email address to finish setting up your FitCoach account. This link expires in 24 hours.",
    "If you didn't sign up, you can ignore this email.",
  ];
  return {
    to,
    subject: "Confirm your email for FitCoach",
    text: `${paragraphs.join("\n\n")}\n\n${url}\n`,
    html: layout("Confirm your email", paragraphs, { label: "Confirm email", url }),
  };
}

export function resetPasswordMessage(to: string, url: string): EmailMessage {
  const paragraphs = [
    "Someone asked to reset the password for your FitCoach account. This link expires in 1 hour and works once.",
    "If it wasn't you, ignore this email — your password stays the same.",
  ];
  return {
    to,
    subject: "Reset your FitCoach password",
    text: `${paragraphs.join("\n\n")}\n\n${url}\n`,
    html: layout("Reset your password", paragraphs, { label: "Choose a new password", url }),
  };
}

/** Sent instead of a new account when someone signs up with an email that already has one. */
export function accountExistsMessage(to: string, loginUrl: string, resetUrl: string): EmailMessage {
  const paragraphs = [
    "Someone tried to create a FitCoach account with this email address, but you already have one.",
    `You can sign in at ${loginUrl}, or reset your password at ${resetUrl}.`,
    "If this wasn't you, you can ignore this email.",
  ];
  return {
    to,
    subject: "You already have a FitCoach account",
    text: `${paragraphs.join("\n\n")}\n`,
    html: layout("You already have an account", paragraphs, { label: "Sign in", url: loginUrl }),
  };
}

/** A client portal invite (D19): the same single-use link as the WhatsApp invite. */
export function clientInviteMessage(
  to: string,
  firstName: string,
  trainerName: string,
  url: string,
): EmailMessage {
  const paragraphs = [
    `Hi ${firstName},`,
    `${trainerName} has set up your FitCoach account so you can see your workouts and progress.`,
    "Open the link below to get started. It works once and expires in 7 days.",
    "If you weren't expecting this, you can ignore this email.",
  ];
  return {
    to,
    subject: `${trainerName} invited you to FitCoach`,
    text: `${paragraphs.join("\n\n")}\n\n${url}\n`,
    html: layout("You're invited to FitCoach", paragraphs, { label: "Open FitCoach", url }),
  };
}

/** Client re-login code (§12.2): 6 digits, 10 minutes. */
export function clientCodeMessage(to: string, code: string): EmailMessage {
  const paragraphs = [
    `Your FitCoach sign-in code is ${code}.`,
    "It expires in 10 minutes. Don't share it with anyone.",
    "If you didn't ask for a code, you can ignore this email.",
  ];
  return {
    to,
    subject: `${code} is your FitCoach sign-in code`,
    text: `${paragraphs.join("\n\n")}\n`,
    html: layout("Your sign-in code", paragraphs),
  };
}
