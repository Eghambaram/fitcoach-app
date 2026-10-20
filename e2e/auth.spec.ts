import { expect, type APIRequestContext, test } from "@playwright/test";

/**
 * Step 1.3 "Done when", end to end against the running API + real SMTP (Mailpit):
 * sign up with a beta code → verification email arrives in Mailpit → log in → see sessions → log out.
 * The browser UI for these screens arrives in step 1.4; until then this drives the API directly.
 */
const API = "http://localhost:4000";
const MAILPIT = "http://localhost:8025";
const WEB_HEADERS = { origin: "http://localhost:3000", "x-fitcoach-request": "1" };

/** Reads Mailpit with a plain context: Mailpit refuses requests carrying another site's Origin header. */
async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const search = await request.get(`${MAILPIT}/api/v1/search`, {
      params: { query: `to:"${email}"` },
    });
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const message = messages.find((m) => m.Subject === "Confirm your email for FitCoach");
    if (message) {
      const body = (await (
        await request.get(`${MAILPIT}/api/v1/message/${message.ID}`)
      ).json()) as { Text: string };
      const match = body.Text.match(/\/verify-email\?token=([A-Za-z0-9_%-]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no verification email for ${email} in Mailpit`);
}

test("a trainer signs up with a beta code, verifies by email, logs in, sees sessions and logs out", async ({
  playwright,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "API journey — runs once, not per viewport");
  const api = await playwright.request.newContext({ baseURL: API, extraHTTPHeaders: WEB_HEADERS });
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `e2e-${id}@example.test`;
  const password = "an-e2e-test-passphrase";

  const signup = await api.post("/v1/auth/signup", {
    data: {
      account: { email, password },
      profile: { displayName: "E2E Trainer" },
      business: { businessName: "E2E Coaching", slug: `e2e-${id}`, coachingModes: ["online"] },
      inviteCode: process.env.E2E_INVITE_CODE,
      acceptTerms: true,
    },
  });
  expect(signup.status()).toBe(202);

  const token = await verificationLink(request, email);
  expect((await api.post("/v1/auth/verify-email", { data: { token } })).status()).toBe(200);

  expect((await api.post("/v1/auth/login", { data: { email, password } })).status()).toBe(200);
  const me = await (await api.get("/v1/auth/me")).json();
  expect(me).toMatchObject({
    actor: "trainer",
    user: { email, emailVerified: true },
    workspace: { slug: `e2e-${id}` },
  });

  const { sessions } = await (await api.get("/v1/auth/sessions")).json();
  expect(sessions).toHaveLength(1);
  expect(sessions[0].current).toBe(true);

  expect((await api.post("/v1/auth/logout")).status()).toBe(200);
  expect((await api.get("/v1/auth/me")).status()).toBe(401);
  await api.dispose();
});
