import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 5.1 "Done when": a brand-new workspace shows the checklist and zeros; a workspace with data
 * shows numbers you can verify by hand.
 */

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

const card = (page: Page, label: string) =>
  page.getByRole("region", { name: "Key numbers" }).getByRole("link").filter({ hasText: label });

test("a new workspace shows zeros and the checklist; data shows up as numbers and attention items", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  const apiContext = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(apiContext, request);
  await apiContext.dispose();
  await signIn(page, trainer.email, trainer.password);

  // Brand new: the checklist and zeros, nothing invented.
  await expect(page.getByRole("heading", { name: "Get set up" })).toBeVisible();
  await expect(page.getByText("0 of 4 done")).toBeVisible();
  for (const label of [
    "Sessions today",
    "Active clients",
    "New leads",
    "Follow-ups due",
    "Check-ins to review",
    "Payments due",
  ]) {
    await expect(card(page, label)).toContainText("0");
  }
  await expect(page.getByText("All clear")).toBeVisible();
  await expect(page.getByText("Nothing booked")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Data: a client with a package due today, and a session later today.
  const { clientId } = await api(
    page,
    "/v1/onboarding/finalize",
    {
      fullName: "Asha Rao",
      phone: `94${String(Date.now()).slice(-8)}`,
      primaryGoal: "lose_weight",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    },
    { "Idempotency-Key": crypto.randomUUID() },
  );
  await api(
    page,
    `/v1/clients/${clientId}/packages`,
    {
      name: "2 sessions",
      kind: "session_pack",
      sessionsIncluded: 2,
      sessionsPerWeek: null,
      startsOn: day(-1),
      expiresOn: day(60),
      pricePaise: 500_000,
      amountDuePaise: 500_000,
      paymentDueOn: day(0),
    },
    { "Idempotency-Key": crypto.randomUUID() },
  );
  await api(page, "/v1/appointments", {
    clientId,
    kind: "session",
    date: day(0),
    startTime: "23:00",
    durationMin: 30,
    location: "Studio 2",
  });

  await page.reload();
  await expect(page.getByText("1 of 4 done")).toBeVisible();
  await expect(card(page, "Sessions today")).toContainText("1");
  await expect(card(page, "Sessions today")).toContainText("1 in person · 0 online");
  await expect(card(page, "Active clients")).toContainText("1");
  await expect(card(page, "Payments due")).toContainText("1 package expiring");
  const schedule = page
    .getByRole("region", { name: "Today's schedule" })
    .or(
      page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Today's schedule" }) }),
    );
  await expect(schedule.getByText("Asha Rao")).toBeVisible();
  await expect(schedule.getByText(/Studio 2/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payments due", level: 3 })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Remind Asha Rao on WhatsApp" }).first(),
  ).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+\?text=/);
  await expect(page.getByText(/₹5,000 due since/)).toBeVisible();
  await expect(page.getByText(/Asha Rao: Sold 2 sessions/)).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Hide the checklist for good.
  await page.getByRole("button", { name: "Hide the setup checklist" }).click();
  await expect(page.getByRole("heading", { name: "Get set up" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Get set up" })).toHaveCount(0);
});
