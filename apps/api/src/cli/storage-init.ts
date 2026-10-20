/**
 * `pnpm storage:init` — creates the local/CI buckets (RustFS) with public read on the public one.
 * docker compose already does this via `storage-init`; this is for CI and fresh local setups.
 * Refuses staging and production: R2 buckets are configured in Cloudflare (PROMPT §17.7).
 */
import { loadLocalEnv } from "../config/load-env";
import { parseEnv } from "../config/env";
import { ensureLocalBuckets } from "../integrations/storage/local-buckets";
import { createS3Client } from "../integrations/storage/storage.service";
import { fail } from "./cli-db";

async function main(): Promise<void> {
  loadLocalEnv();
  const config = parseEnv(process.env);
  if (config.appEnv === "staging" || config.appEnv === "production") {
    fail(
      "storage:init is for local development and CI. Configure R2 buckets in Cloudflare instead.",
    );
  }
  if (!config.storage) fail("STORAGE_* isn't configured (see .env.example).");

  const client = createS3Client(config.storage);
  for (let attempt = 1; ; attempt++) {
    try {
      await ensureLocalBuckets(client, config.storage);
      break;
    } catch (error) {
      if (attempt >= 20) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }
  client.destroy();
  console.log(
    `[storage:init] buckets ready: ${config.storage.privateBucket}, ${config.storage.publicBucket} (public read)`,
  );
}

main().catch((error: unknown) =>
  fail(`[storage:init] failed: ${error instanceof Error ? error.message : String(error)}`),
);
