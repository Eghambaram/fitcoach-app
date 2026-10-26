import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 3.1 "Done when": clients appear in the right tabs; archiving and restoring keeps all history.
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

async function api(page: Page, path: string, data: object) {
  const response = await page.request.post(`/api${path}`, { headers: WEB_HEADERS, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function newClient(page: Page, fullName: string, extra: object = {}) {
  const { clientId } = await api(page, "/v1/onboarding/finalize", {
    fullName,
    primaryGoal: "build_muscle",
    trainingMode: "in_person",
    consentDataProcessing: true,
    units: { weightUnit: "kg", lengthUnit: "cm" },
    ...extra,
  });
  return clientId as string;
}

test("clients sit in the right tabs, and archiving and restoring keeps their history", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  const apiContext = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(apiContext, request);
  await apiContext.dispose();
  await signIn(page, trainer.email, trainer.password);

  await page.goto("/app/clients");
  await expect(page.getByText("No clients yet")).toBeVisible();

  await newClient(page, "Asha Rao", { weight: 72.5, measuredOn: "2026-10-01" });
  const ravi = await newClient(page, "Ravi Kumar", { trainingMode: "online" });
  await api(page, `/v1/clients/${ravi}/status`, { action: "pause" });

  await page.reload();
  await expect(page.getByRole("tab", { name: /Active.*1/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Paused.*1/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Asha Rao/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Ravi Kumar/ })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("tab", { name: /Paused/ }).click();
  await expect(page).toHaveURL(/status=paused/);
  await expect(page.getByRole("link", { name: /Ravi Kumar/ }).first()).toBeVisible();

  // The profile, with real data only.
  await page.getByRole("tab", { name: /Active/ }).click();
  await page
    .getByRole("link", { name: /Asha Rao/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Asha Rao", level: 1 })).toBeVisible();
  await expect(page.getByText("Build muscle").first()).toBeVisible();
  await expect(page.getByText("72.5 kg").first()).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // A private note, and a session from the profile.
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("textbox", { name: "Add a note" }).fill("Prefers free weights");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Prefers free weights")).toBeVisible();
  await page.getByRole("tab", { name: "Packages" }).click();
  await expect(page.getByText("No active package")).toBeVisible();

  // Archive: gone from Active, in Archived; restore: everything is still there.
  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("textbox", { name: "Reason (optional)" }).fill("Moved cities");
  await page.getByRole("button", { name: "Archive client" }).click();
  await expect(page.getByText(/Asha Rao is now archived/)).toBeVisible();
  await page.goto("/app/clients?status=archived");
  await expect(page.getByRole("link", { name: /Asha Rao/ }).first()).toBeVisible();
  await page
    .getByRole("link", { name: /Asha Rao/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Restore" }).first().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText(/Asha Rao is now active/)).toBeVisible();
  await expect(page.getByText("Archived: Moved cities")).toBeVisible();
  await page.getByRole("tab", { name: "Notes" }).click();
  await expect(page.getByText("Prefers free weights")).toBeVisible();
  await page.getByRole("tab", { name: "Progress" }).click();
  await expect(page.getByText("72.5 kg")).toBeVisible();
});
