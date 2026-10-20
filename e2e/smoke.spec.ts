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

  // Direct API call from the test runner only; browsers always go through the web origin (CLAUDE.md rule 10).
  test("api liveness endpoint is up", async ({ request }) => {
    const response = await request.get("http://localhost:4000/v1/health");

    expect(response.ok()).toBe(true);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
