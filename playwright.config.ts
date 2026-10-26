import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
/**
 * Where the tests run:
 * - default: starts the production builds (run `pnpm build` first; `pnpm verify` does), or reuses
 *   servers already listening locally.
 * - `E2E_EXTERNAL_SERVERS=1`: the stack is already up on :3000/:4000 (`docker compose --profile full
 *   up`, as in CI), so nothing is started.
 * - `E2E_BASE_URL=https://…`: a deployed environment (post-deploy smoke). Only `smoke.spec.ts` is
 *   meant for it; no servers, no global setup (it needs database access).
 * The dev server recompiles routes on first visit and can reload pages mid-test, which makes parallel
 * runs flaky. `E2E_DEV=1 pnpm test:e2e --workers=1` uses the dev servers for a quick local check.
 */
const remoteBaseUrl = process.env.E2E_BASE_URL;
const externalServers = Boolean(remoteBaseUrl) || process.env.E2E_EXTERNAL_SERVERS === "1";
const useDevServers = process.env.E2E_DEV === "1";
const apiCommand = useDevServers
  ? "pnpm --filter @fitcoach/api dev"
  : "pnpm --filter @fitcoach/api start";
const webCommand = useDevServers
  ? "pnpm --filter @fitcoach/web dev"
  : "pnpm --filter @fitcoach/web start";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: remoteBaseUrl ? undefined : "./e2e/global-setup.ts",
  fullyParallel: true,
  // Room for argon2 hashing and email delivery through Mailpit (and dev compiles with E2E_DEV=1).
  expect: { timeout: 15_000 },
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: remoteBaseUrl ?? "http://localhost:3000",
    trace: "on-first-retry",
    // Toasts and drawers then render without transitions, so axe never samples a half-faded
    // element (it did in CI: contrast "failures" from 1.4:1 to 4.3:1 mid-fade). Also exercises
    // the reduced-motion path the app must support (§7.4).
    reducedMotion: "reduce",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Chromium-based phone viewport (`pnpm test:e2e --project=mobile`), so only one browser engine is needed.
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: externalServers
    ? undefined
    : [
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
