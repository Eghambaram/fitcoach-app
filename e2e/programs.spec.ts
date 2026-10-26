import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 3.4 "Done when": build a program from a template in under 5 minutes and assign it; the
 * client's upcoming workouts appear.
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

async function api(page: Page, path: string, data: object) {
  const response = await page.request.post(`/api${path}`, { headers: WEB_HEADERS, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test("a trainer builds a program from a template and assigns it; upcoming workouts appear", async ({
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
  const started = Date.now();

  // Start from a template: your own copy opens in the builder.
  await page.goto("/app/programs");
  await expect(page.getByText("No programs yet")).toBeVisible();
  await page.getByRole("button", { name: "Use template Beginner Full Body 3×/week" }).click();
  await expect(page).toHaveURL(/\/app\/programs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Program name" })).toHaveValue(
    "Beginner Full Body 3×/week",
  );

  // Rename, reorder with the keyboard alternative, add an exercise from the library, save.
  await page.getByRole("textbox", { name: "Program name" }).fill("Asha – first block");
  const first = page.getByRole("list", { name: "Full Body A exercises" });
  await expect(first.getByRole("listitem").first()).toContainText("1. Goblet Squat");
  await page.getByRole("button", { name: "Move Goblet Squat down" }).click();
  await expect(first.getByRole("listitem").first()).toContainText("1. Incline Push-Up");
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const picker = page.getByRole("dialog", { name: "Add exercise" });
  await picker.getByRole("searchbox", { name: "Search exercises" }).fill("farmer");
  await picker.getByRole("button", { name: /^Farmer's Carry/ }).click();
  await expect(first.getByText("6. Farmer's Carry")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Save program" }).click();
  await expect(page.getByText("Program saved.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asha – first block", level: 1 })).toBeVisible();

  // Assign it to Asha.
  await page.getByRole("button", { name: "Assign to client" }).click();
  const assign = page.getByRole("dialog", { name: "Assign to client" });
  await assign.getByRole("combobox", { name: "Client" }).selectOption({ label: "Asha Rao" });
  await assign.getByRole("button", { name: "Assign program" }).click();
  await expect(page).toHaveURL(new RegExp(`/app/clients/${clientId}\\?tab=workouts`));
  await expect(page.getByRole("heading", { name: "Asha – first block" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming workouts" })).toBeVisible();
  await expect(page.getByText(/· Full Body A/).first()).toBeVisible();
  expect(Date.now() - started).toBeLessThan(5 * 60_000);

  // The program shows who follows it.
  await page.goto("/app/programs");
  await expect(page.getByRole("link", { name: /Asha – first block.*1 client/ })).toBeVisible();
});
