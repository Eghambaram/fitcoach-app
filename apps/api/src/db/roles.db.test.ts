import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { MIGRATIONS_FOLDER } from "../test/postgres.global-setup";
import { createPool, sqlState, withContext } from "../test/db";
import { APP_ROLE, SYSTEM_ROLE } from "./bootstrap-roles";
import { runMigrations } from "./run-migrations";

describe("database roles (PROMPT §4.5)", () => {
  let owner: Pool;
  let app: Pool;
  let system: Pool;

  beforeAll(() => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    system = createPool(db.systemUrl);
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end(), system.end()]);
  });

  it("gives fitcoach_app no way around RLS and fitcoach_system BYPASSRLS", async () => {
    const { rows } = await owner.query<{
      rolname: string;
      rolbypassrls: boolean;
      rolsuper: boolean;
      rolcreaterole: boolean;
    }>(
      "select rolname, rolbypassrls, rolsuper, rolcreaterole from pg_roles where rolname = any($1) order by rolname",
      [[APP_ROLE, SYSTEM_ROLE]],
    );

    expect(rows).toEqual([
      { rolname: APP_ROLE, rolbypassrls: false, rolsuper: false, rolcreaterole: false },
      { rolname: SYSTEM_ROLE, rolbypassrls: true, rolsuper: false, rolcreaterole: false },
    ]);
  });

  it("stops both roles from changing the schema", async () => {
    expect(await sqlState(app.query("create table public.sneaky (id int)"))).toBe("42501");
    expect(await sqlState(system.query("create table public.sneaky (id int)"))).toBe("42501");
  });

  it("keeps fitcoach_app out of the pg-boss and migration journal schemas", async () => {
    expect(await sqlState(app.query("select * from pgboss.version"))).toBe("42501");
    expect(await sqlState(app.query("select * from drizzle.__drizzle_migrations"))).toBe("42501");
  });

  it("lets only fitcoach_system call the rate limiter", async () => {
    expect(await sqlState(app.query("select app.check_rate_limit('k', 60, 5)"))).toBe("42501");
    expect(
      await sqlState(system.query("select app.check_rate_limit('roles-test', 60, 5)")),
    ).toBeUndefined();
  });

  it("reads an empty request context as NULL", async () => {
    const row = await withContext(app, {}, async (client) => {
      const result = await client.query(
        "select app.current_user_id() as u, app.current_workspace_id() as w, app.current_client_id() as c, app.current_actor() as a",
      );
      return result.rows[0];
    });

    expect(row).toEqual({ u: null, w: null, c: null, a: null });
  });

  it("scopes the request context to its transaction", async () => {
    await withContext(
      app,
      { userId: "00000000-0000-4000-8000-000000000001", actor: "trainer" },
      async () => undefined,
    );
    const { rows } = await app.query("select app.current_user_id() as u");

    expect(rows[0]).toEqual({ u: null });
  });

  it("re-runs the whole migration idempotently (role bootstrap, journal, pg-boss)", async () => {
    const db = inject("db");

    await runMigrations({
      ownerUrl: db.ownerUrl,
      appPassword: db.appPassword,
      systemPassword: db.systemPassword,
      migrationsFolder: MIGRATIONS_FOLDER,
    });

    const { rows } = await app.query("select current_user as role");
    expect(rows[0]).toEqual({ role: APP_ROLE });
  });
});
