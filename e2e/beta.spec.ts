import AxeBuilder from "@axe-core/playwright";
import {
  type APIRequestContext,
  expect,
  type Page,
  type PlaywrightWorkerArgs,
  test,
} from "@playwright/test";
import { createVerifiedTrainer, randomIp, WEB_HEADERS } from "./support";

/** Step 5.3: public site, PWA, feedback, data export and an accessibility sweep. */

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": randomIp() });
});

async function noViolations(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
}

async function newTrainer(
  page: Page,
  playwright: PlaywrightWorkerArgs["playwright"],
  request: APIRequestContext,
) {
  const apiContext = await playwright.request.newContext({ extraHTTPHeaders: WEB_HEADERS });
  const trainer = await createVerifiedTrainer(apiContext, request);
  await apiContext.dispose();
  await signIn(page, trainer.email, trainer.password);
  return trainer;
}

test.describe("public site", () => {
  test("landing, pricing, beta FAQ and legal pages are honest and accessible", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: "Personal Trainer Copilot" }),
    ).toBeVisible();
    await expect(page.getByText(/trusted by/i)).toHaveCount(0);
    await noViolations(page);

    await page.getByRole("link", { name: "Request beta access" }).click();
    await expect(page).toHaveURL(/\/pricing#request-access$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Free during the beta" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Beta requests: Not configured|opens your email app/).first(),
    ).toBeVisible();
    await noViolations(page);

    await page.goto("/beta");
    for (const limitation of [
      /No group sessions/,
      /No chat inside the app/,
      /No self-booking/,
      /No progress photos yet/,
      /Payments are recorded manually/,
    ]) {
      await expect(page.getByText(limitation)).toBeVisible();
    }
    await noViolations(page);

    for (const path of ["/privacy", "/terms"]) {
      await page.goto(path);
      await expect(page.getByText(/needs legal review before launch/)).toBeVisible();
      await noViolations(page);
    }
  });
});

test.describe("installable app", () => {
  test("serves the manifest, icons, service worker and offline page", async ({ page, request }) => {
    const manifest = await request.get("/manifest.webmanifest");
    expect(manifest.ok()).toBe(true);
    const body = await manifest.json();
    expect(body).toMatchObject({
      short_name: "FitCoach",
      display: "standalone",
      theme_color: "#18211D",
      background_color: "#F6F7F3",
    });
    const purposes = (body.icons as { sizes: string; purpose: string }[]).map(
      (icon) => `${icon.sizes}:${icon.purpose}`,
    );
    expect(purposes).toEqual(
      expect.arrayContaining(["192x192:maskable", "512x512:maskable", "512x512:any"]),
    );
    for (const icon of body.icons as { src: string }[]) {
      expect((await request.get(icon.src)).ok()).toBe(true);
    }
    const worker = await request.get("/sw.js");
    expect(worker.ok()).toBe(true);
    expect(worker.headers()["content-type"]).toContain("javascript");
    expect(await worker.text()).toContain('url.pathname.startsWith("/api/")');

    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    await noViolations(page);
  });

  test("shows the offline page when a page can't load", async ({ page, context, isMobile }) => {
    // Chrome's phone emulation shows its own error page for offline navigations instead of
    // dispatching them to the worker; the worker is the same on both, so check it on desktop.
    test.skip(isMobile, "offline navigation through the worker is checked on desktop");
    await page.goto("/pricing");
    // Evaluated as strings: the e2e tsconfig has no service worker typings.
    await page.evaluate("navigator.serviceWorker.ready.then(() => true)");
    // The worker controls the page after a reload.
    await page.reload();
    await expect
      .poll(() => page.evaluate("navigator.serviceWorker.controller !== null"))
      .toBe(true);
    await context.setOffline(true);
    await page.goto("/beta").catch(() => undefined);
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();
    await context.setOffline(false);
  });
});

test("a trainer sends feedback from the screen they're on", async ({
  page,
  playwright,
  request,
  isMobile,
}) => {
  await newTrainer(page, playwright, request);
  await page.goto("/app/clients");
  if (isMobile) await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("link", { name: "Send feedback" }).click();
  await expect(page).toHaveURL(/\/app\/feedback\?from=%2Fapp%2Fclients$/);
  await expect(page.getByText("Sent from")).toContainText("/app/clients");
  await noViolations(page);

  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Tell us a little more")).toBeVisible();
  await page
    .getByLabel("What's working, what's broken, what's missing?")
    .fill("Clients list should show sessions left.");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("Thanks, your feedback was saved.")).toBeVisible();
  await page.getByRole("link", { name: "Back to where you were" }).click();
  await expect(page).toHaveURL(/\/app\/clients$/);
});

test("a trainer exports their data and downloads the zip", async ({
  page,
  playwright,
  request,
}) => {
  test.slow();
  await newTrainer(page, playwright, request);
  await page.goto("/app/settings");
  await page.getByRole("link", { name: /Export your data/ }).click();
  await expect(page.getByRole("heading", { name: "Export your data" })).toBeVisible();
  await expect(page.getByText("No exports yet")).toBeVisible();
  await noViolations(page);

  await page.getByRole("button", { name: "Export my data" }).click();
  await expect(page.getByText("Preparing").first()).toBeVisible();
  // Built by the background job; the list polls until it's ready.
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("Ready")).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^fitcoach-export-\d{4}-\d{2}-\d{2}\.zip$/);
  await noViolations(page);
});

test("main trainer and client screens pass an accessibility check", async ({
  page,
  browser,
  playwright,
  request,
}) => {
  test.slow();
  await newTrainer(page, playwright, request);
  for (const path of [
    "/app/dashboard",
    "/app/leads",
    "/app/clients",
    "/app/calendar",
    "/app/programs",
    "/app/exercises",
    "/app/check-ins",
    "/app/progress",
    "/app/settings",
    "/app/settings/profile",
    "/app/settings/templates",
    "/app/settings/packages",
    "/app/settings/security",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1").first()).toBeVisible();
    const violations = (await new AxeBuilder({ page }).analyze()).violations;
    expect(violations, `${path}: ${violations.map((item) => item.id).join(", ")}`).toEqual([]);
  }

  const created = await page.request.post("/api/v1/onboarding/finalize", {
    headers: { ...WEB_HEADERS, "Idempotency-Key": crypto.randomUUID() },
    data: {
      fullName: "Asha Rao",
      phone: `95${String(Date.now()).slice(-8)}`,
      primaryGoal: "lose_weight",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { clientId } = await created.json();
  await page.goto(`/app/clients/${clientId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Asha Rao" })).toBeVisible();
  await noViolations(page);

  const invite = await page.request.post(`/api/v1/clients/${clientId}/portal/invite`, {
    headers: WEB_HEADERS,
    data: { channel: "whatsapp" },
  });
  const { link } = await invite.json();
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": randomIp() } });
  const phone = await context.newPage();
  await phone.goto(link);
  await phone.getByRole("checkbox").check();
  await phone.getByRole("button", { name: "Continue" }).click();
  await expect(phone.getByRole("heading", { name: "Hi Asha" })).toBeVisible();
  for (const path of [
    "/client/home",
    "/client/workouts",
    "/client/progress",
    "/client/check-in",
    "/client/schedule",
    "/client/more",
    "/client/profile",
  ]) {
    await phone.goto(path);
    await expect(phone.locator("main h1").first()).toBeVisible();
    const violations = (await new AxeBuilder({ page: phone }).analyze()).violations;
    expect(violations, `${path}: ${violations.map((item) => item.id).join(", ")}`).toEqual([]);
  }
  await context.close();
});
