/**
 * Migration entry point.
 * - Railway / Docker: the API image's CMD runs this before the server (ADR-0043) — a failure exits the
 *   container, so the deploy never becomes healthy and the previous one keeps serving.
 * - Local:   `pnpm db:migrate`.
 */
import { join } from "node:path";
import { z } from "zod";
import { loadLocalEnv } from "../config/load-env";
import { runMigrations } from "./run-migrations";

const migrateEnvSchema = z.object({
  DATABASE_OWNER_URL: z.string().url(),
  DB_APP_PASSWORD: z.string().min(12),
  DB_SYSTEM_PASSWORD: z.string().min(12),
});

async function main(): Promise<void> {
  loadLocalEnv();
  const parsed = migrateEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Names only — these variables hold secrets.
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid migration settings: ${names}`);
  }

  await runMigrations({
    ownerUrl: parsed.data.DATABASE_OWNER_URL,
    appPassword: parsed.data.DB_APP_PASSWORD,
    systemPassword: parsed.data.DB_SYSTEM_PASSWORD,
    migrationsFolder: join(__dirname, "migrations"),
    log: (message) => console.log(`[migrate] ${message}`),
  });
}

main().catch((error: unknown) => {
  console.error("[migrate] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
