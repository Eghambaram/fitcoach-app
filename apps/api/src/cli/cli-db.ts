import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";
import { loadLocalEnv } from "../config/load-env";
import type { Tx } from "../db/database";
import * as schema from "../db/schema";

const cliEnvSchema = z.object({
  APP_ENV: z.string().default("development"),
  DATABASE_SYSTEM_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
});

export interface CliEnv {
  appEnv: string;
  sessionSecret: string;
}

/**
 * Operator CLIs (platform:grant, beta:invite, db:seed) run as fitcoach_system — the same role and
 * the same audited domain functions the API uses, outside the HTTP stack (CLAUDE.md rule 4).
 */
export async function withSystemDb<T>(fn: (tx: Tx, env: CliEnv) => Promise<T>): Promise<T> {
  loadLocalEnv();
  const parsed = cliEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const names = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Missing or invalid settings: ${names} (see .env.example)`);
  }

  const pool = new Pool({
    connectionString: parsed.data.DATABASE_SYSTEM_URL,
    max: 1,
    application_name: "fitcoach-cli",
  });
  try {
    const db = drizzle({ client: pool, schema });
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.actor', 'system', true)`);
      return fn(tx, { appEnv: parsed.data.APP_ENV, sessionSecret: parsed.data.SESSION_SECRET });
    });
  } finally {
    await pool.end();
  }
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const ownerEnvSchema = z.object({ DATABASE_OWNER_URL: z.string().url() });

/**
 * Runs `fn` as the database owner, in one transaction — only for audited operator actions that the
 * app roles are deliberately not allowed to do (data deletion, PROMPT §12.4). Throw to roll back.
 */
export async function withOwnerDb<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  loadLocalEnv();
  const parsed = ownerEnvSchema.safeParse(process.env);
  if (!parsed.success) throw new Error("DATABASE_OWNER_URL is not set (see .env.example)");
  const pool = new Pool({
    connectionString: parsed.data.DATABASE_OWNER_URL,
    max: 1,
    application_name: "fitcoach-cli-owner",
  });
  try {
    return await drizzle({ client: pool, schema }).transaction((tx) => fn(tx));
  } finally {
    await pool.end();
  }
}
