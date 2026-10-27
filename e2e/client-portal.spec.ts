import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, type Browser, expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, MAILPIT, randomIp, uniqueId, WEB_HEADERS } from "./support";

/**
 * Step 4.1 "Done when": invite a test client from your phone, open the link on a second phone and
 * land in the client app; reusing the link fails.
 */

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

/** A second device: its own cookies and client IP. */
async function phone(browser: Browser) {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
  });
  return { context, page: await context.newPage() };
}

/** The 6-digit code in the newest sign-in email to `email` (Mailpit). */
async function codeFromEmail(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const search = await request.get(`${MAILPIT}/api/v1/search`, {
      params: { query: `to:"${email}"` },
    });
    const { messages } = (await search.json()) as { messages: { Subject: string }[] };
    const code = messages
      .map((m) => m.Subject.match(/^(\d{6}) is your FitCoach sign-in code$/)?.[1])
      .find(Boolean);
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no sign-in code for ${email}`);
}

test("a trainer invites a client by WhatsApp link; the client lands in the app once, and signs back in by email code", async ({
  page,
  browser,
  playwright,
  request,
}) => {
  test.slow();
  const apiContext = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(apiContext, request);
  await apiContext.dispose();
  await signIn(page, trainer.email, trainer.password);
  const clientEmail = `asha-${uniqueId()}@example.test`;
  const created = await page.request.post("/api/v1/onboarding/finalize", {
    headers: { ...WEB_HEADERS, "Idempotency-Key": crypto.randomUUID() },
    data: {
      fullName: "Asha Rao",
      phone: `98${String(Date.now()).slice(-8)}`,
      email: clientEmail,
      primaryGoal: "build_muscle",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { clientId } = await created.json();

  // Trainer: Client profile → Client app → Invite via WhatsApp.
  await page.goto(`/app/clients/${clientId}`);
  const card = page.getByRole("region", { name: "Client app" });
  await expect(card.getByText("Not invited")).toBeVisible();
  await card.getByRole("button", { name: "Invite via WhatsApp" }).click();
  const dialog = page.getByRole("dialog", { name: "Invite link for Asha Rao" });
  await expect(dialog.getByRole("link", { name: "Open WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/\d+\?text=/,
  );
  const link =
    (
      await dialog
        .getByText(/\/invite\//)
        .last()
        .textContent()
    )?.trim() ?? "";
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(card.getByText("Invited", { exact: true })).toBeVisible();

  // Second phone: the link names the trainer, asks for the terms, then signs in.
  const second = await phone(browser);
  await second.page.goto(link);
  await expect(second.page.getByText("E2E Trainer", { exact: true })).toBeVisible();
  await expect(second.page.getByText("Asha")).toHaveCount(0);
  expect((await new AxeBuilder({ page: second.page }).analyze()).violations).toEqual([]);
  await second.page.getByRole("button", { name: "Continue" }).click();
  await expect(second.page.getByText("Accept the terms to continue")).toBeVisible();
  await second.page.getByRole("checkbox").check();
  await second.page.getByRole("button", { name: "Continue" }).click();
  await expect(second.page).toHaveURL(/\/client\/home$/);
  await expect(second.page.getByRole("heading", { name: "Hi Asha" })).toBeVisible();
  expect((await new AxeBuilder({ page: second.page }).analyze()).violations).toEqual([]);
  // Clients never reach the trainer workspace.
  await second.page.goto("/app/clients");
  await expect(second.page).toHaveURL(/\/client\/home$/);

  // Reusing the link fails.
  const third = await phone(browser);
  await third.page.goto(link);
  await expect(third.page.getByText("This link has expired or was already used.")).toBeVisible();
  await third.page.goto("/client/home");
  await expect(third.page).toHaveURL(/\/client\/login$/);

  // Re-login with an email code.
  await third.page.getByLabel("Email").fill(clientEmail);
  await third.page.getByRole("button", { name: "Get a sign-in code" }).click();
  await expect(third.page.getByText(/we've sent it a 6-digit code/)).toBeVisible();
  await third.page.getByLabel("Sign-in code").fill(await codeFromEmail(request, clientEmail));
  await third.page.getByRole("button", { name: "Sign in" }).click();
  await expect(third.page).toHaveURL(/\/client\/home$/);
  await expect(third.page.getByRole("heading", { name: "Hi Asha" })).toBeVisible();

  // The trainer sees them as active, and can turn access off.
  await page.reload();
  await expect(card.getByText("Active", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Turn off access" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Turn off access" }).click();
  await expect(card.getByText("Access revoked")).toBeVisible();
  await second.page.reload();
  await expect(second.page).toHaveURL(/\/client\/login$/);

  await second.context.close();
  await third.context.close();
});
