import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 3.3 "Done when": the library is searchable and filterable on your phone; you can add a
 * custom exercise. Also: the starter templates are browsable from Programs.
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

test("a trainer browses templates, searches and filters the library, and adds an exercise", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  const apiContext = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(apiContext, request);
  await apiContext.dispose();
  await signIn(page, trainer.email, trainer.password);

  // Programs is live in the navigation (behind More on phones).
  const nav = page.getByRole("navigation", { name: "Main" });
  if ((page.viewportSize()?.width ?? 1280) < 640) {
    await nav.getByRole("button", { name: "More" }).click();
    await page.getByRole("link", { name: "Programs" }).click();
  } else {
    await nav.getByRole("link", { name: "Programs" }).click();
  }
  await expect(page.getByRole("heading", { name: "Programs", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preview Push/Pull/Legs 6×/week" })).toBeVisible();
  await page.getByRole("button", { name: "Preview Beginner Full Body 3×/week" }).click();
  const template = page.getByRole("dialog", { name: "Beginner Full Body 3×/week" });
  await expect(template.getByRole("heading", { name: "Full Body A" })).toBeVisible();
  await expect(template.getByText("Goblet Squat")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");

  // The library: search, filter, details with safety notes and alternatives.
  await page.getByRole("link", { name: "Exercise library" }).click();
  await expect(page.getByRole("heading", { name: "Exercise library" })).toBeVisible();
  await expect(page.getByText(/\d{3} library exercises/)).toBeVisible();
  await page.getByRole("searchbox", { name: "Search exercises by name" }).fill("goblet");
  await expect(page).toHaveURL(/q=goblet/);
  await expect(page.getByText("1 exercise", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Goblet Squat/ }).click();
  const detail = page.getByRole("dialog", { name: "Goblet Squat" });
  await expect(detail.getByRole("heading", { name: "Safety notes" })).toBeVisible();
  await detail.getByRole("button", { name: "Bodyweight Squat" }).click();
  await expect(page.getByRole("dialog", { name: "Bodyweight Squat" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("searchbox", { name: "Search exercises by name" }).fill("");
  await page.getByRole("combobox", { name: "Equipment" }).selectOption("band");
  await page.getByRole("combobox", { name: "Muscle group" }).selectOption("back");
  await expect(page).toHaveURL(/equipment=band/);
  await expect(page.getByRole("button", { name: /Band Row/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Barbell Back Squat/ })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Add a custom exercise; it shows under "Yours".
  await page.getByRole("button", { name: "Add exercise" }).first().click();
  const form = page.getByRole("dialog", { name: "Add exercise" });
  await form.getByRole("textbox", { name: "Name" }).fill("Landmine Press");
  await form.getByRole("checkbox", { name: "Shoulders" }).check();
  await form.getByRole("checkbox", { name: "Barbell" }).check();
  await form
    .getByRole("textbox", { name: "Instructions (optional)" })
    .fill("Press the bar end up and forward.");
  await form.getByRole("button", { name: "Add exercise" }).click();
  await expect(page.getByText("Exercise added.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Landmine Press" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Clear the band/back filters, then look under "Yours".
  await page.getByRole("combobox", { name: "Equipment" }).selectOption("");
  await page.getByRole("combobox", { name: "Muscle group" }).selectOption("");
  await page.getByRole("tab", { name: /Yours/ }).click();
  await expect(page).toHaveURL(/source=custom/);
  await expect(page.getByRole("button", { name: /Landmine Press/ })).toBeVisible();
});
