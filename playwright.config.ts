import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

// In CI the apps are already built, so run the production servers; locally reuse `pnpm dev` if it is running.
const apiCommand = isCI ? "pnpm --filter @fitcoach/api start" : "pnpm --filter @fitcoach/api dev";
const webCommand = isCI ? "pnpm --filter @fitcoach/web start" : "pnpm --filter @fitcoach/web dev";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Chromium-based phone viewport (`pnpm test:e2e --project=mobile`), so only one browser engine is needed.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: apiCommand,
      url: "http://localhost:4000/v1/health",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: webCommand,
      url: "http://localhost:3000/healthz",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
