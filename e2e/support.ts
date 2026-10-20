import { type APIRequestContext, expect } from "@playwright/test";

export const API = "http://localhost:4000";
export const MAILPIT = "http://localhost:8025";
export const WEB_HEADERS = { origin: "http://localhost:3000", "x-fitcoach-request": "1" };

/**
 * A random client IP for one test. The API rate-limits per IP and only trusts X-Forwarded-For from
 * the local proxy hop, so this keeps parallel and repeated local runs from sharing one budget.
 */
export function randomIp(): string {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

export function uniqueId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * The newest link to `path` in an email to `email`, read from Mailpit's API. Use the plain
 * `request` fixture: Mailpit refuses requests carrying another site's Origin header.
 */
export async function linkFromEmail(
  request: APIRequestContext,
  email: string,
  subject: string,
  path: "/verify-email" | "/reset-password",
): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const search = await request.get(`${MAILPIT}/api/v1/search`, {
      params: { query: `to:"${email}"` },
    });
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const message = messages.find((m) => m.Subject === subject);
    if (message) {
      const body = (await (
        await request.get(`${MAILPIT}/api/v1/message/${message.ID}`)
      ).json()) as { Text: string };
      const match = body.Text.match(new RegExp(`https?://[^\\s]+${path}\\?token=[A-Za-z0-9_%-]+`));
      if (match?.[0]) return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no "${subject}" email for ${email} in Mailpit`);
}

/** A verified trainer created through the API (fast path for tests that start signed in). */
export async function createVerifiedTrainer(api: APIRequestContext, request: APIRequestContext) {
  const id = uniqueId();
  const email = `e2e-${id}@example.test`;
  const password = "an-e2e-test-passphrase";
  const ip = { "x-forwarded-for": randomIp() };
  const signup = await api.post(`${API}/v1/auth/signup`, {
    headers: ip,
    data: {
      account: { email, password },
      profile: { displayName: "E2E Trainer" },
      business: { businessName: "E2E Coaching", slug: `e2e-${id}`, coachingModes: ["online"] },
      inviteCode: process.env.E2E_INVITE_CODE,
      acceptTerms: true,
    },
  });
  expect(signup.status()).toBe(202);
  const link = await linkFromEmail(
    request,
    email,
    "Confirm your email for FitCoach",
    "/verify-email",
  );
  const token = new URL(link).searchParams.get("token");
  expect(
    (await api.post(`${API}/v1/auth/verify-email`, { headers: ip, data: { token } })).status(),
  ).toBe(200);
  return { email, password, slug: `e2e-${id}` };
}
