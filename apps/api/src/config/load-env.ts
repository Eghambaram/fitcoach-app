import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads a local `.env` for development tooling (`pnpm dev`, `pnpm db:migrate`).
 * Looks in the current directory, then the repo root (scripts run from apps/api).
 * Variables already set in the environment win; on Railway there is no file and nothing happens.
 */
export function loadLocalEnv(cwd: string = process.cwd()): string | undefined {
  for (const candidate of [resolve(cwd, ".env"), resolve(cwd, "../../.env")]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
  }
  return undefined;
}
