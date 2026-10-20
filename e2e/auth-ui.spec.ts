import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  API,
  createVerifiedTrainer,
  linkFromEmail,
  randomIp,
  uniqueId,
  WEB_HEADERS,
} from "./support";

/** Step 1.4 "Done when": signup and login work in the browser on desktop and mobile. */

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

async function expectNoA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

test("a trainer signs up in three steps, confirms the email, logs in, checks sessions and signs out", async ({
  page,
  request,
}) => {
  const id = uniqueId();
  const email = `e2e-ui-${id}@example.test`;
  const password = "an-e2e-ui-passphrase";

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your trainer account" })).toBeVisible();
  await expectNoA11yViolations(page);

  // Step 1 — Account. "Continue" validates before moving on.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter a valid email address")).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 — Profile.
  await page.getByLabel("Your name").fill("Asha Rao");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3 — Business. The page address is suggested from the business name.
  await page.getByLabel("Business name").fill(`UI Coaching ${id}`);
  await expect(page.getByLabel("Your page address")).toHaveValue(`ui-coaching-${id}`);
  await page.getByText("Online", { exact: true }).click();
  await page.getByLabel("Beta invite code").fill(process.env.E2E_INVITE_CODE ?? "");
  await page.getByLabel(/I accept the FitCoach terms/).check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/verify-email\?sent=1/);
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  // The link in the real email (via Mailpit) needs one click — scanners can't use it up.
  await page.goto(
    await linkFromEmail(request, email, "Confirm your email for FitCoach", "/verify-email"),
  );
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByText("Your email is confirmed")).toBeVisible();
  await page.getByRole("link", { name: "Log in" }).click();

  await logIn(page, email, password);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Asha");

  // Settings → Security lists this device.
  if (isMobile(page)) {
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
  } else {
    await page.getByRole("link", { name: "Settings" }).click();
  }
  await page.getByRole("link", { name: /Security/ }).click();
  await expect(page.getByText("This device")).toBeVisible();

  // Sign out.
  if (isMobile(page)) {
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
  } else {
    // The sidebar's button — the Security page also lists "Sign out" for this device.
    await page.getByRole("complementary").getByRole("button", { name: "Sign out" }).click();
  }
  await expect(page).toHaveURL(/\/login$/);

  // Signed out: the workspace is closed again.
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fdashboard/);
});

test("the trainer shell shows only MVP navigation, unbuilt screens as 'coming soon'", async ({
  page,
  playwright,
  request,
}) => {
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(api, request);
  await api.dispose();
  await logIn(page, trainer.email, trainer.password);

  const nav = page.getByRole("navigation", { name: "Main" });
  if (isMobile(page)) {
    await expect(nav.getByRole("link", { name: "Home" })).toBeVisible();
    for (const label of ["Leads", "Clients", "Calendar"]) {
      // Disabled items read "<label> (coming soon)" to screen readers.
      await expect(nav.getByText(new RegExp(`^${label}`))).toBeVisible();
      await expect(nav.getByRole("link", { name: label })).toHaveCount(0);
    }
    await expect(nav.getByRole("button", { name: "More" })).toBeVisible();
  } else {
    const items = await nav.locator(":scope > *").allInnerTexts();
    expect(items.map((text) => text.split("\n")[0]?.trim())).toEqual([
      "Dashboard",
      "Leads",
      "Clients",
      "Calendar",
      "Programs",
      "Workouts",
      "Check-ins",
      "Progress",
      "Settings",
    ]);
    await expect(nav.getByRole("link")).toHaveText(["Dashboard", "Settings"]);
  }
  // Not in the MVP: never shown (PROMPT §6).
  for (const hidden of ["Nutrition", "Messages", "Billing", "Templates"]) {
    await expect(page.getByText(hidden, { exact: true })).toHaveCount(0);
  }
  await expectNoA11yViolations(page);
});

test("navigating to /platform as a trainer is refused by the API", async ({
  page,
  playwright,
  request,
}) => {
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(api, request);

  await logIn(page, trainer.email, trainer.password);
  await page.goto("/platform");

  await expect(page.getByRole("heading", { name: "You don't have access to this" })).toBeVisible();
  await expect(page.getByText("Super Admin")).toHaveCount(0);

  // The refusal comes from the API itself, not only the UI.
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === "fc_session");
  const direct = await api.get(`${API}/v1/platform/access`, {
    headers: { cookie: `fc_session=${session?.value}` },
  });
  expect(direct.status()).toBe(403);
  await api.dispose();
});

test("wrong credentials show one generic message", async ({ page }) => {
  await page.goto("/login");
  await expectNoA11yViolations(page);
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel(/^Password/).fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();

  // Scoped to <main>: Next's route announcer also uses role="alert".
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "That email and password don't match.",
  );
});

test("forgot password answers the same for any email", async ({ page }) => {
  await page.goto("/forgot-password");
  await expectNoA11yViolations(page);
  await page.getByLabel("Email").fill(`nobody-${uniqueId()}@example.test`);
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByText(/If there's an account for that email/)).toBeVisible();
});
