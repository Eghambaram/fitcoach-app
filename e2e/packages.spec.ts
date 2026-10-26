import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 3.2 "Done when": sell a 12-session pack, mark 3 sessions attended and 1 no-show, record a
 * partial payment, and the numbers are right everywhere.
 */

test.use({ timezoneId: "Asia/Kolkata" });

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

const ZONE = "Asia/Kolkata";
function day(offset: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

/** Calls the API as the signed-in trainer, through the web origin. */
async function api(page: Page, path: string, data: object) {
  const response = await page.request.post(`/api${path}`, { headers: WEB_HEADERS, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("a trainer sells a 12-session pack, marks attendance, records a partial payment", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  const apiContext = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(apiContext, request);
  await apiContext.dispose();
  await signIn(page, trainer.email, trainer.password);

  const { clientId } = await api(page, "/v1/onboarding/finalize", {
    fullName: "Asha Rao",
    primaryGoal: "build_muscle",
    trainingMode: "in_person",
    consentDataProcessing: true,
    units: { weightUnit: "kg", lengthUnit: "cm" },
  });
  for (const [offset, time] of [
    [-1, "07:00"],
    [-1, "18:00"],
    [-2, "07:00"],
    [-3, "07:00"],
  ] as const) {
    await api(page, "/v1/appointments", {
      clientId,
      kind: "session",
      date: day(offset),
      startTime: time,
      durationMin: 60,
    });
  }

  // Sell from the Packages tab, starting from the "12 sessions" preset.
  await page.goto(`/app/clients/${clientId}?tab=packages`);
  await expect(page.getByText("No active package")).toBeVisible();
  await page.getByRole("button", { name: "Sell package" }).click();
  const sheet = page.getByRole("dialog", { name: "Sell package" });
  await sheet
    .getByLabel("Start from a preset")
    .selectOption({ label: "12 sessions (12 sessions · valid 42 days)" });
  await expect(sheet.getByRole("textbox", { name: "Name" })).toHaveValue("12 sessions");
  await sheet.getByRole("spinbutton", { name: "Price (₹)" }).fill("12000");
  await sheet.getByRole("spinbutton", { name: "Amount due (₹)" }).fill("10000");
  await sheet.getByLabel("Payment due by (optional)").fill(day(0));
  await sheet.getByRole("button", { name: "Sell package" }).click();
  await expect(page.getByText("Package sold.")).toBeVisible();
  await expect(page.getByText("0 of 12 used")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Mark 3 attended and 1 no-show from the calendar's attendance list.
  await page.goto("/app/calendar");
  // With more than 3 the list starts collapsed.
  await page.getByText("4 past sessions need attendance").click();
  for (const remaining of [3, 2, 1]) {
    await page.getByRole("button", { name: "Mark Asha Rao attended" }).first().click();
    await expect(
      page.getByText(
        `${remaining} past session${remaining === 1 ? " needs" : "s need"} attendance`,
      ),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Mark Asha Rao no-show" }).click();
  await expect(page.getByText(/past sessions? needs? attendance/)).toHaveCount(0);

  // The overview card: 4 of 12 used, ₹10,000 due; record a partial ₹4,000 payment.
  await page.goto(`/app/clients/${clientId}`);
  await expect(page.getByText("4 of 12 used")).toBeVisible();
  await expect(page.getByText("₹10,000", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).first().click();
  const payment = page.getByRole("dialog", { name: "Record payment" });
  await payment.getByRole("spinbutton", { name: "Amount (₹)" }).fill("4000");
  await payment.getByRole("textbox", { name: "Reference (optional)" }).fill("UPI-4521");
  await payment.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();
  await expect(page.getByText("₹6,000", { exact: true })).toBeVisible();

  // Packages tab: progress, money, the payment (recorded manually) and every session use.
  await page.getByRole("tab", { name: "Packages" }).click();
  await expect(page.getByText("8 left")).toBeVisible();
  const facts = page.getByRole("definition");
  await expect(facts.filter({ hasText: "₹12,000" })).toBeVisible();
  await expect(facts.filter({ hasText: "₹4,000" })).toBeVisible();
  await expect(page.getByText("₹4,000 · UPI")).toBeVisible();
  await expect(page.getByText(/recorded manually/)).toBeVisible();
  await expect(page.getByText(/^No-show/)).toBeVisible();
  await expect(page.getByText(/^Attended/)).toHaveCount(3);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // The clients list finds them under "Payment due".
  await page.goto("/app/clients?attention=payment_due");
  await expect(page.getByRole("link", { name: /Asha Rao/ }).first()).toBeVisible();
});
