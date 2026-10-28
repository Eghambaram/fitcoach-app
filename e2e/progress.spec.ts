import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 4.4 "Done when": you add a few weights over different dates, share weight only, and the
 * client sees weight but not waist.
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

async function addValue(page: Page, measurement: string, value: string, date: string) {
  await page.getByRole("button", { name: "Add value" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a value" });
  await dialog.getByRole("combobox", { name: "Measurement" }).selectOption({ label: measurement });
  await dialog.getByRole("spinbutton", { name: "Value" }).fill(value);
  await dialog.getByLabel("Date").fill(date);
  await dialog.getByRole("button", { name: "Save value" }).click();
  await expect(dialog).toHaveCount(0);
}

test("the trainer records weights, shares weight only, and the client sees weight but not waist", async ({
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
      phone: `95${String(Date.now()).slice(-8)}`,
      primaryGoal: "lose_weight",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    },
    { "Idempotency-Key": crypto.randomUUID() },
  );

  // Trainer: three weights on different dates and a waist value.
  await page.goto(`/app/clients/${clientId}?tab=progress`);
  await expect(page.getByText("No measurements yet")).toBeVisible();
  await addValue(page, "Weight", "80", day(-50));
  await addValue(page, "Weight", "78.5", day(-20));
  await addValue(page, "Weight", "77", day(0));
  await addValue(page, "Waist", "88", day(0));
  await page.getByRole("tab", { name: "Weight" }).click();
  await expect(page.getByText("77 kg", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/−3 kg/)).toBeVisible();
  await expect(page.getByRole("img", { name: /^Weight from/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Share weight only.
  await page.getByRole("checkbox", { name: "Weight" }).check();
  await page.getByRole("button", { name: "Save sharing" }).click();
  await expect(page.getByText("Sharing saved.")).toBeVisible();
  await expect(page.getByText("Shared with client")).toBeVisible();

  // The overview lists her change.
  await page.goto("/app/progress");
  await expect(page.getByRole("link", { name: /Asha Rao/ })).toContainText("−3 kg");

  // Client: weight, not waist.
  const invite = await api(page, `/v1/clients/${clientId}/portal/invite`, { channel: "whatsapp" });
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": randomIp() },
    timezoneId: ZONE,
  });
  const phone = await context.newPage();
  await phone.goto(invite.link);
  await phone.getByRole("checkbox").check();
  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByRole("heading", { name: "Hi Asha" })).toBeVisible();
  await expect(phone.getByText(/−3 kg since/)).toBeVisible();
  await phone.getByRole("link", { name: "Progress" }).first().click();
  await expect(phone.getByRole("heading", { name: "My progress" })).toBeVisible();
  await expect(phone.getByRole("tab", { name: "Weight" })).toBeVisible();
  await expect(phone.getByRole("tab", { name: "Waist" })).toHaveCount(0);
  await expect(phone.getByText("88 cm")).toHaveCount(0);
  await expect(phone.getByText("77 kg", { exact: true }).first()).toBeVisible();
  await expect(phone.getByRole("button", { name: "Add" })).toHaveCount(0);
  expect((await new AxeBuilder({ page: phone }).analyze()).violations).toEqual([]);
  await context.close();
});
