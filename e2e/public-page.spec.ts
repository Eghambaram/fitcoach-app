import AxeBuilder from "@axe-core/playwright";
import {
  type APIRequestContext,
  expect,
  type Page,
  type PlaywrightWorkerArgs,
  test,
} from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/**
 * Step 2.1 "Done when": publish your page, submit an enquiry from a private window, and the lead
 * exists (the API suite checks source + consent rows); settings sections save with field errors.
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

async function newTrainer(
  playwright: PlaywrightWorkerArgs["playwright"],
  request: APIRequestContext,
) {
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(api, request);
  await api.dispose();
  return trainer;
}

test("a trainer publishes their page and a visitor sends an enquiry from a private window", async ({
  page,
  browser,
  playwright,
  request,
}) => {
  test.slow();
  const trainer = await newTrainer(playwright, request);
  await signIn(page, trainer.email, trainer.password);

  await page.goto("/app/settings/profile");
  await expect(
    page.getByRole("heading", { name: "Profile & public page", level: 1 }),
  ).toBeVisible();

  // Publishing needs a headline first.
  await page.getByRole("button", { name: "Publish page" }).click();
  await expect(page.getByText("Add a headline before publishing your page.")).toBeVisible();

  await page.getByLabel("Your name").fill("Asha Rao");
  await page.getByLabel("Headline").fill("Strength coaching for busy people");
  await page.getByLabel("Location").fill("Pune");
  await page.getByLabel("Add a coaching type").fill("Strength");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("button", { name: "Publish page" }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();

  // Share screen: link, QR and per-source links.
  await page.getByRole("link", { name: "Share" }).click();
  await expect(
    page.getByRole("heading", { name: "Share your enquiry page", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /QR code that opens/ })).toBeVisible();
  await expect(page.getByText(`/coach/${trainer.slug}?src=instagram`)).toBeVisible();

  // A visitor with no session, as in a private window.
  const visitor = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
  const publicPage = await visitor.newPage();
  await publicPage.goto(`/coach/${trainer.slug}?src=instagram&utm_campaign=e2e`);
  await expect(publicPage.getByRole("heading", { name: "Asha Rao", level: 1 })).toBeVisible();
  await expect(publicPage.getByText("Strength coaching for busy people")).toBeVisible();
  const axe = await new AxeBuilder({ page: publicPage }).analyze();
  expect(axe.violations).toEqual([]);

  await publicPage.getByLabel(/^Your name/).fill("Ravi Kumar");
  await publicPage.getByLabel(/^Phone/).fill("98765 43210");
  await publicPage.getByLabel(/^Your main goal/).selectOption("get_stronger");
  await publicPage
    .getByRole("checkbox", { name: /I agree that this coach may contact me/ })
    .check();
  await publicPage.getByRole("button", { name: "Send enquiry" }).click();
  await expect(publicPage.getByRole("heading", { name: "Thanks, Ravi!" })).toBeVisible();
  await visitor.close();
});

test("an unpublished page isn't public", async ({ page, playwright, request }) => {
  const trainer = await newTrainer(playwright, request);
  const response = await page.goto(`/coach/${trainer.slug}`);
  expect(response?.status()).toBe(404);
});

test("message templates refuse unknown placeholders", async ({ page, playwright, request }) => {
  const trainer = await newTrainer(playwright, request);
  await signIn(page, trainer.email, trainer.password);
  await page.goto("/app/settings/templates");

  const followUp = page.getByRole("textbox", { name: "Follow-up" });
  await followUp.fill("Hi {name}, shall we book a trial?");
  await expect(page.getByText("Unknown placeholder: {name}")).toBeVisible();
  await followUp.fill("Hi {first_name}, shall we book a trial?");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Follow-up message saved.")).toBeVisible();
  await expect(page.getByText("Edited")).toBeVisible();
});

test("settings sections load and save", async ({ page, playwright, request }) => {
  const trainer = await newTrainer(playwright, request);
  await signIn(page, trainer.email, trainer.password);

  await page.goto("/app/settings");
  await expect(page.getByText("You're on the free beta plan")).toBeVisible();

  await page.goto("/app/settings/check-ins");
  await page.getByLabel("Flag after no check-in for (days)").fill("5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto("/app/settings/packages");
  await page.getByRole("button", { name: "Add package" }).click();
  // Scope to the drawer: the page behind it has a "Low sessions alert at" field too.
  const drawer = page.getByRole("dialog", { name: "Add package" });
  await drawer.getByLabel("Name", { exact: true }).fill("10 sessions");
  await drawer.getByLabel("Sessions", { exact: true }).fill("10");
  await drawer.getByLabel("Default price (₹)").fill("12000");
  await drawer.getByRole("button", { name: "Save package" }).click();
  await expect(page.getByText("₹12,000")).toBeVisible();
});
