import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { PgBoss } from "pg-boss";
import { Client } from "pg";
import { APP_ROLE, bootstrapRoles, type RolePasswords, SYSTEM_ROLE } from "./bootstrap-roles";

export const PGBOSS_SCHEMA = "pgboss";

export interface RunMigrationsOptions extends RolePasswords {
  /** Owner/admin connection — the only place it is used (PROMPT §17.3 DATABASE_OWNER_URL). */
  ownerUrl: string;
  migrationsFolder: string;
  log?: (message: string) => void;
}

/**
 * The full database setup, in order (PROMPT §10.6):
 * 1. role bootstrap  2. SQL migrations (Drizzle journal)  3. pg-boss schema  4. pg-boss grants.
 * Every step is idempotent, so it runs on every Railway deploy (`preDeployCommand`) and locally.
 */
export async function runMigrations(options: RunMigrationsOptions): Promise<void> {
  const log = options.log ?? (() => undefined);
  const client = new Client({
    connectionString: options.ownerUrl,
    application_name: "fitcoach-migrate",
  });
  await client.connect();
  try {
    // Serialise concurrent deploys/replicas: only one migrator runs at a time.
    await client.query("SELECT pg_advisory_lock(hashtext('fitcoach:migrate'))");

    log("bootstrapping roles");
    await client.query("BEGIN");
    await bootstrapRoles(client, options);
    await client.query("COMMIT");

    log("applying SQL migrations");
    await migrate(drizzle({ client }), { migrationsFolder: options.migrationsFolder });

    log("installing pg-boss schema");
    const boss = new PgBoss({
      connectionString: options.ownerUrl,
      schema: PGBOSS_SCHEMA,
      max: 1,
      supervise: false,
      schedule: false,
      application_name: "fitcoach-migrate-pgboss",
    });
    await boss.start();
    await boss.stop({ graceful: false, close: true });

    // Jobs run as fitcoach_system; pg-boss creates queue partitions at runtime, so it needs CREATE.
    // fitcoach_app gets nothing in this schema.
    log("granting pg-boss access to the system role");
    await client.query(`
      REVOKE ALL ON SCHEMA ${PGBOSS_SCHEMA} FROM PUBLIC, ${APP_ROLE};
      GRANT USAGE, CREATE ON SCHEMA ${PGBOSS_SCHEMA} TO ${SYSTEM_ROLE};
      GRANT ALL ON ALL TABLES IN SCHEMA ${PGBOSS_SCHEMA} TO ${SYSTEM_ROLE};
      GRANT ALL ON ALL SEQUENCES IN SCHEMA ${PGBOSS_SCHEMA} TO ${SYSTEM_ROLE};
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${PGBOSS_SCHEMA} TO ${SYSTEM_ROLE};
      ALTER DEFAULT PRIVILEGES IN SCHEMA ${PGBOSS_SCHEMA} GRANT ALL ON TABLES TO ${SYSTEM_ROLE};
      ALTER DEFAULT PRIVILEGES IN SCHEMA ${PGBOSS_SCHEMA} GRANT ALL ON SEQUENCES TO ${SYSTEM_ROLE};
      ALTER DEFAULT PRIVILEGES IN SCHEMA ${PGBOSS_SCHEMA} GRANT EXECUTE ON FUNCTIONS TO ${SYSTEM_ROLE};
    `);

    log("done");
  } finally {
    await client.end();
  }
}
