import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("foundation smoke", () => {
  test("home page renders without accessibility violations", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: "Personal Trainer Copilot" }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test("web liveness endpoint is up", async ({ request }) => {
    const response = await request.get("/healthz");

    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  // Through the web origin's /api proxy, as browsers do (CLAUDE.md rule 10). This also works against a
  // deployed environment, where the API has no public domain (post-deploy smoke, E2E_BASE_URL).
  test("api liveness endpoint is reachable through the web proxy", async ({ request }) => {
    const response = await request.get("/api/v1/health");

    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("api is ready: database, job queue and object storage reachable", async ({ request }) => {
    const response = await request.get("/api/v1/health/ready");

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      checks: { database: { status: "ok" }, jobs: { status: "ok" }, storage: { status: "ok" } },
    });
  });
});
