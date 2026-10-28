import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { createVerifiedTrainer, grantPlatformOwner, randomIp, totp, WEB_HEADERS } from "./support";

/** Step 6.1: the platform owner area (PROMPT §16.0). */

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

async function noViolations(page: Page) {
  const violations = (await new AxeBuilder({ page }).analyze()).violations;
  expect(violations, violations.map((item) => item.id).join(", ")).toEqual([]);
}

test("sends a signed-out visitor to the platform login", async ({ page }) => {
  await page.goto("/platform/trainers");
  await expect(page).toHaveURL(/\/platform\/login$/);
  await expect(page.getByRole("heading", { name: "FitCoach platform" })).toBeVisible();
  await noViolations(page);
});

test("a platform owner sets up MFA, then manages a trainer, invites, feedback and health", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const ownerAccount = await createVerifiedTrainer(api, request);
  const trainer = await createVerifiedTrainer(api, request);
  await api.dispose();
  grantPlatformOwner(ownerAccount.email);

  // Password, then the authenticator.
  await page.goto("/platform/login");
  await page.getByLabel("Email").fill(ownerAccount.email);
  await page.getByLabel(/^Password/).fill(ownerAccount.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("img", { name: "QR code for your authenticator app" })).toBeVisible();
  await noViolations(page);
  await page.getByText("Can't scan? Enter the key").click();
  const secret = (await page.locator("details p").innerText()).trim();
  await page.getByLabel(/6-digit code/).fill(totp(secret));
  await page.getByRole("button", { name: "Turn on and continue" }).click();
  await expect(page.getByText("Your authenticator is set up.")).toBeVisible();
  await expect(page.locator("ol li")).toHaveCount(10);
  await page.getByLabel("I've saved my recovery codes").check();
  await page.getByRole("button", { name: "Go to the platform" }).click();

  // Overview: real counts, no revenue.
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
  await expect(page.getByText("Billing: Not configured.")).toBeVisible();
  await expect(page.getByText(/revenue \d|MRR/i)).toHaveCount(0);
  await noViolations(page);

  // Find the trainer, suspend with a reason, reactivate.
  await page.goto(`/platform/trainers?q=${encodeURIComponent(trainer.email)}`);
  await noViolations(page);
  await page.getByRole("link", { name: "E2E Coaching" }).first().click();
  await expect(page.getByRole("heading", { name: "E2E Coaching" })).toBeVisible();
  await expect(page.getByText("Counts only — no client details.")).toBeVisible();
  await noViolations(page);
  await page.getByRole("button", { name: "Suspend" }).click();
  await page.getByRole("button", { name: "Suspend" }).last().click();
  await expect(page.getByText("Give a short reason")).toBeVisible();
  await page.getByLabel("Reason").fill("E2E check");
  await page.getByRole("button", { name: "Suspend" }).last().click();
  await expect(page.getByText("Suspended", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Reactivate" }).click();
  await page.getByLabel("Reason").fill("All good");
  await page.getByRole("button", { name: "Reactivate" }).last().click();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();

  // Audited.
  await page.getByRole("link", { name: "See this workspace's audit log" }).click();
  await expect(
    page.getByText("workspace.suspended").filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("E2E check").filter({ visible: true }).first()).toBeVisible();
  await noViolations(page);

  // A beta invite code, shown once.
  await page.goto("/platform/settings");
  await page.getByLabel("Label").fill("E2E batch");
  await page.getByRole("button", { name: "Create code" }).click();
  await expect(page.getByText(/^FIT-[A-Z0-9]{4}-[A-Z0-9]{4}$/)).toBeVisible();
  await noViolations(page);

  await page.goto("/platform/feedback");
  await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible();
  await noViolations(page);

  await page.goto("/platform/health");
  await expect(page.getByRole("heading", { name: "Backups" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Database" })).toBeVisible();
  await noViolations(page);
});

test("the next sign-in asks for a code; the trainer login doesn't open the platform", async ({
  page,
  playwright,
  request,
}) => {
  const api = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const ownerAccount = await createVerifiedTrainer(api, request);
  await api.dispose();
  grantPlatformOwner(ownerAccount.email);

  // Enrol through the API, as the browser would.
  const login = await page.request.post("/api/v1/platform/auth/login", {
    headers: WEB_HEADERS,
    data: { email: ownerAccount.email, password: ownerAccount.password },
  });
  expect(login.ok()).toBe(true);
  const setup = await (await page.request.get("/api/v1/platform/auth/mfa/setup")).json();
  const enabled = await page.request.post("/api/v1/platform/auth/mfa/enable", {
    headers: WEB_HEADERS,
    data: { code: totp(setup.secret) },
  });
  expect(enabled.ok()).toBe(true);
  await page.context().clearCookies();

  // A trainer session (same person, normal login) is refused by the API.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerAccount.email);
  await page.getByLabel(/^Password/).fill(ownerAccount.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await page.goto("/platform");
  await expect(page.getByText("This area is only for the FitCoach team.")).toBeVisible();

  // The platform login asks for the next code.
  await page.goto("/platform/login");
  await page.getByLabel("Email").fill(ownerAccount.email);
  await page.getByLabel(/^Password/).fill(ownerAccount.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/6-digit code/).fill(totp(setup.secret, 1));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Platform overview" })).toBeVisible();
});
