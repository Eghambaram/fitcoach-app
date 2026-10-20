import type { ClientBase } from "pg";

export const APP_ROLE = "fitcoach_app";
export const SYSTEM_ROLE = "fitcoach_system";

export interface RolePasswords {
  appPassword: string;
  systemPassword: string;
}

/**
 * Idempotently creates or updates the two login roles (PROMPT §4.5). Safe to run on every deploy:
 * passwords are re-applied from env and attributes are re-asserted, so drift is corrected.
 * Runs as the database owner (Railway's `postgres`) inside the caller's transaction.
 */
export async function bootstrapRoles(client: ClientBase, passwords: RolePasswords): Promise<void> {
  const roles = [
    // Request traffic. Must never bypass RLS.
    {
      name: APP_ROLE,
      password: passwords.appPassword,
      attributes: "NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT",
    },
    // Jobs, pre-session auth lookups, public enquiry insert, platform aggregates — only via SystemDb.run().
    {
      name: SYSTEM_ROLE,
      password: passwords.systemPassword,
      attributes: "NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS NOINHERIT",
    },
  ];

  for (const role of roles) {
    const name = client.escapeIdentifier(role.name);
    const password = client.escapeLiteral(role.password);
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role.name]);
    const verb = exists.rowCount ? "ALTER" : "CREATE";
    await client.query(`${verb} ROLE ${name} WITH LOGIN ${role.attributes} PASSWORD ${password}`);
  }

  const { rows } = await client.query<{ db: string }>("SELECT current_database() AS db");
  const currentDatabase = rows[0]?.db;
  if (!currentDatabase) throw new Error("could not determine the current database");
  const database = client.escapeIdentifier(currentDatabase);
  await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${APP_ROLE}, ${SYSTEM_ROLE}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}, ${SYSTEM_ROLE}`);
  // Neither role may create objects; only migrations (the owner) change the schema.
  await client.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC, ${APP_ROLE}, ${SYSTEM_ROLE}`);
}
