import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/** Step 5.2: the bell for trainers and clients (PROMPT §8.10). */

const ZONE = "Asia/Kolkata";
test.use({ timezoneId: ZONE });

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

const day = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offset * 86_400_000),
  );

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

test("trainers and clients see their own notifications and can mark them read", async ({
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
      phone: `93${String(Date.now()).slice(-8)}`,
      primaryGoal: "lose_weight",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    },
    { "Idempotency-Key": crypto.randomUUID() },
  );
  const invite = await api(page, `/v1/clients/${clientId}/portal/invite`, { channel: "whatsapp" });

  // The client joins and checks in.
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
    timezoneId: ZONE,
  });
  const phone = await context.newPage();
  await phone.goto(invite.link);
  await phone.getByRole("checkbox").check();
  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByRole("heading", { name: "Hi Asha" })).toBeVisible();
  const sent = await phone.request.put("/api/v1/client/check-in", {
    headers: WEB_HEADERS,
    data: { feeling: "good", energy: 7, sleep: 6, soreness: "mild" },
  });
  expect(sent.ok()).toBe(true);

  // Trainer: the bell shows both, opening one goes there and marks it read.
  await page.reload();
  const bell = page.getByRole("button", { name: /^Notifications, 2 unread$/ }).first();
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(page.getByText("Asha Rao joined the client app")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: /Check-in from Asha Rao/ }).click();
  await expect(page).toHaveURL(/\/app\/check-ins$/);
  await expect(
    page.getByRole("button", { name: /^Notifications, 1 unread$/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Notifications, 1 unread$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByRole("button", { name: /^Notifications$/ }).first()).toBeVisible();

  // Client: a booked session shows in their bell, nothing of the trainer's.
  await api(page, "/v1/appointments", {
    clientId,
    kind: "session",
    date: day(2),
    startTime: "09:00",
    durationMin: 45,
  });
  await phone.reload();
  await phone.getByRole("button", { name: /^Notifications, 1 unread$/ }).click();
  await expect(phone.getByText(/^Session booked:/)).toBeVisible();
  await expect(phone.getByText("Asha Rao joined the client app")).toHaveCount(0);
  await context.close();
});
