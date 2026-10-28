/**
 * `pnpm restore:check <database-url>` — checks a restored database (docs/runbooks/restore.md,
 * PROMPT §17.5): migrations and row counts, then that every live `files` row still resolves to
 * its object in R2. Read-only. Uses STORAGE_* from the environment (the environment the files
 * belong to). Exits 1 if any object is missing.
 */
import { HeadObjectCommand, NotFound } from "@aws-sdk/client-s3";
import { Pool } from "pg";
import { loadLocalEnv } from "../config/load-env";
import { createS3Client } from "../integrations/storage/storage.service";
import { fail } from "./cli-db";

const TABLES = [
  "workspaces",
  "users",
  "clients",
  "leads",
  "appointments",
  "workout_sessions",
  "measurements",
  "check_ins",
  "client_packages",
  "client_payments",
  "audit_logs",
  "files",
] as const;

function storageFromEnv() {
  const env = process.env;
  const need = (name: string) => env[name] ?? fail(`${name} is not set`);
  return {
    endpoint: need("STORAGE_ENDPOINT"),
    region: env.STORAGE_REGION ?? "auto",
    accessKeyId: need("STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: need("STORAGE_SECRET_ACCESS_KEY"),
    privateBucket: need("STORAGE_PRIVATE_BUCKET"),
    publicBucket: need("STORAGE_PUBLIC_BUCKET"),
    publicBaseUrl: env.STORAGE_PUBLIC_BASE_URL ?? "",
    keyPrefix: env.STORAGE_KEY_PREFIX ?? "",
    budgetBytes: 0,
    hardLimitBytes: 0,
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const databaseUrl = process.argv[2];
  if (!databaseUrl?.startsWith("postgres")) fail("Usage: pnpm restore:check <database-url>");
  const storage = storageFromEnv();
  const s3 = createS3Client(storage);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    application_name: "fitcoach-restore-check",
  });
  try {
    const migrations = await pool.query<{ n: string; last: string }>(
      "select count(*) as n, max(created_at)::text as last from drizzle.__drizzle_migrations",
    );
    console.warn(`Migrations applied: ${migrations.rows[0]?.n ?? 0}`);
    for (const table of TABLES) {
      const { rows } = await pool.query<{ n: string }>(`select count(*) as n from ${table}`);
      console.warn(`  ${table.padEnd(18)} ${rows[0]?.n ?? 0}`);
    }

    const files = await pool.query<{
      bucket: string;
      object_key: string;
      thumbnail_key: string | null;
    }>(
      "select bucket, object_key, thumbnail_key from files where deleted_at is null and purged_at is null",
    );
    let missing = 0;
    for (const file of files.rows) {
      const bucket = file.bucket === "public" ? storage.publicBucket : storage.privateBucket;
      for (const key of [file.object_key, file.thumbnail_key]) {
        if (!key) continue;
        try {
          await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        } catch (error) {
          if (!(error instanceof NotFound)) throw error;
          missing += 1;
          console.warn(`  missing: ${file.bucket}/${key}`);
        }
      }
    }
    console.warn(`Files checked: ${files.rows.length}, objects missing: ${missing}`);
    if (missing > 0) process.exitCode = 1;
  } finally {
    await pool.end();
    s3.destroy();
  }
}

main().catch((error: unknown) =>
  fail(`[restore:check] failed: ${error instanceof Error ? error.message : String(error)}`),
);
