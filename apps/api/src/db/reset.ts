/**
 * `pnpm db:reset` — drops and recreates the LOCAL database, then migrates it from zero.
 * Refuses to run anywhere but a local development/test database.
 */
import { join } from "node:path";
import { Client } from "pg";
import { loadLocalEnv } from "../config/load-env";
import { runMigrations } from "./run-migrations";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

async function main(): Promise<void> {
  loadLocalEnv();
  const appEnv = process.env.APP_ENV ?? "development";
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  const appPassword = process.env.DB_APP_PASSWORD;
  const systemPassword = process.env.DB_SYSTEM_PASSWORD;
  if (!ownerUrl || !appPassword || !systemPassword) {
    throw new Error("DATABASE_OWNER_URL, DB_APP_PASSWORD and DB_SYSTEM_PASSWORD must be set");
  }

  const target = new URL(ownerUrl);
  if (!["development", "test"].includes(appEnv) || !LOCAL_HOSTS.has(target.hostname)) {
    throw new Error(
      `db:reset only runs against a local database (APP_ENV=${appEnv}, host=${target.hostname})`,
    );
  }
  const database = target.pathname.slice(1);

  const maintenanceUrl = new URL(ownerUrl);
  maintenanceUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: maintenanceUrl.toString() });
  await admin.connect();
  try {
    const name = admin.escapeIdentifier(database);
    console.log(`[db:reset] dropping and recreating ${database}`);
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  await runMigrations({
    ownerUrl,
    appPassword,
    systemPassword,
    migrationsFolder: join(__dirname, "migrations"),
    log: (message) => console.log(`[migrate] ${message}`),
  });
}

main().catch((error: unknown) => {
  console.error("[db:reset] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
