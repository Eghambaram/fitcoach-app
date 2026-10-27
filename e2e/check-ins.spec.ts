import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 4.3 "Done when": the client checks in from their phone, you see it in the inbox and mark
 * it reviewed.
 */

test.use({ timezoneId: "Asia/Kolkata" });

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

async function api(page: Page, path: string, data: object, headers: Record<string, string> = {}) {
  const response = await page.request.post(`/api${path}`, {
    headers: { ...WEB_HEADERS, ...headers },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("a client checks in from their phone; the trainer sees it in the inbox, replies and marks it reviewed", async ({
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
  const { clientId } = await api(
    page,
    "/v1/onboarding/finalize",
    {
      fullName: "Asha Rao",
      phone: `96${String(Date.now()).slice(-8)}`,
      primaryGoal: "build_muscle",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    },
    { "Idempotency-Key": crypto.randomUUID() },
  );

  // The client profile's Check-ins tab: on by default, with a Nudge link while it's due.
  await page.goto(`/app/clients/${clientId}?tab=check-ins`);
  await expect(page.getByRole("link", { name: "Nudge on WhatsApp" })).toHaveAttribute(
    "href",
    /^https:\/\/wa\.me\/\d+\?text=/,
  );
  await expect(page.getByText("No check-ins yet")).toBeVisible();
  const invite = await api(page, `/v1/clients/${clientId}/portal/invite`, { channel: "whatsapp" });

  // Client phone: the home prompt, then the check-in form.
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
    timezoneId: "Asia/Kolkata",
  });
  const phone = await context.newPage();
  await phone.goto(invite.link);
  await phone.getByRole("checkbox").check();
  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByRole("heading", { name: "Time for today's check-in" })).toBeVisible();
  await phone.getByRole("link", { name: "Check in now" }).click();
  await expect(phone.getByRole("heading", { name: "Daily check-in" })).toBeVisible();
  expect((await new AxeBuilder({ page: phone }).analyze()).violations).toEqual([]);
  await phone.getByRole("button", { name: "Submit check-in" }).click();
  await expect(phone.getByText("Choose how you feel")).toBeVisible();
  await phone.getByRole("radio", { name: "Good" }).check({ force: true });
  await phone.getByRole("slider", { name: "Energy level" }).fill("8");
  await phone.getByRole("slider", { name: "Sleep quality" }).fill("6");
  await phone.getByRole("radio", { name: "Mild" }).check({ force: true });
  await phone.getByLabel("Notes (optional)").fill("Legs a bit sore");
  await phone.getByRole("button", { name: "Submit check-in" }).click();
  await expect(phone.getByText("Sent to E2E Trainer")).toBeVisible();
  await expect(phone.getByText("8/10")).toBeVisible();

  // Trainer inbox: unreviewed first; reply and mark reviewed.
  await page.goto("/app/check-ins");
  await expect(page.getByRole("tab", { name: "To review (1)" })).toBeVisible();
  const card = page.getByRole("listitem").filter({ hasText: "Asha Rao" });
  await expect(card.getByText("Legs a bit sore")).toBeVisible();
  await expect(card.getByText("Self-reported by the client.")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await card.getByLabel("Reply to the client (optional)").fill("Rest well tonight.");
  await card.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByText("Marked reviewed.")).toBeVisible();
  await expect(card.getByText("Reviewed", { exact: true })).toBeVisible();

  // The client sees the reply.
  await phone.reload();
  await expect(phone.getByText("Rest well tonight.")).toBeVisible();

  // The trainer's client tab shows it, and the Nudge is gone once it has arrived.
  await page.goto(`/app/clients/${clientId}?tab=check-ins`);
  await expect(
    page.getByRole("list", { name: "Check-ins" }).getByText("Legs a bit sore"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Nudge on WhatsApp" })).toHaveCount(0);
  await context.close();
});
