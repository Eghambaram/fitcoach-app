import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, twoTenants, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

const insertKey = `
  insert into idempotency_keys (workspace_id, user_id, key, endpoint, request_hash, expires_at)
  values ($1, $2, $3, 'POST /v1/test', 'hash', now() + interval '1 day')
`;

describe("idempotency_keys RLS", () => {
  let app: Pool;
  let system: Pool;
  // Real trainers: idempotency_keys has FKs to users and workspaces since step 1.3.
  let a: ReturnType<typeof trainerContext>;
  let b: ReturnType<typeof trainerContext>;
  const keyA = randomUUID();

  beforeAll(async () => {
    const db = inject("db");
    app = createPool(db.appUrl);
    system = createPool(db.systemUrl);
    a = trainerContext(await createTrainer(drizzleFor(system)));
    b = trainerContext(await createTrainer(drizzleFor(system)));
    await committed(app, a, (client) => client.query(insertKey, [a.workspaceId, a.userId, keyA]));
  });

  afterAll(async () => {
    await Promise.all([app.end(), system.end()]);
  });

  it("shows a user their own keys", async () => {
    const rows = await withContext(
      app,
      a,
      async (client) => (await client.query("select key from idempotency_keys")).rows,
    );

    expect(rows).toEqual([{ key: keyA }]);
  });

  it("hides them from another tenant", async () => {
    const rows = await withContext(
      app,
      b,
      async (client) => (await client.query("select key from idempotency_keys")).rows,
    );

    expect(rows).toEqual([]);
  });

  it("hides everything from an empty context", async () => {
    const rows = await withContext(
      app,
      {},
      async (client) => (await client.query("select key from idempotency_keys")).rows,
    );

    expect(rows).toEqual([]);
  });

  it("rejects writing a key into another tenant's workspace (tampering)", async () => {
    const state = await withContext(app, b, (client) =>
      sqlState(client.query(insertKey, [a.workspaceId, b.userId, randomUUID()])),
    );

    expect(state).toBe("42501");
  });

  it("can't update another tenant's key or delete keys at all", async () => {
    const updated = await withContext(
      app,
      b,
      async (client) =>
        (
          await client.query("update idempotency_keys set response_status = 200 where key = $1", [
            keyA,
          ])
        ).rowCount,
    );
    const deleteState = await withContext(app, a, (client) =>
      sqlState(client.query("delete from idempotency_keys")),
    );

    expect(updated).toBe(0);
    expect(deleteState).toBe("42501");
  });

  it("enforces one row per user intent", async () => {
    const state = await withContext(app, a, (client) =>
      sqlState(client.query(insertKey, [a.workspaceId, a.userId, keyA])),
    );

    expect(state).toBe("23505");
  });
});

const insertAudit = `
  insert into audit_logs (actor_kind, actor_user_id, workspace_id, action)
  values ($1, $2, $3, 'test.action')
`;

describe("audit_logs (insert-only, PROMPT §10.3)", () => {
  let app: Pool;
  let system: Pool;
  const { a, b } = twoTenants();

  beforeAll(() => {
    const db = inject("db");
    app = createPool(db.appUrl);
    system = createPool(db.systemUrl);
  });

  afterAll(async () => {
    await Promise.all([app.end(), system.end()]);
  });

  it("accepts an entry matching the request's own context", async () => {
    const state = await withContext(app, a, (client) =>
      sqlState(client.query(insertAudit, ["trainer", a.userId, a.workspaceId])),
    );

    expect(state).toBeUndefined();
  });

  it.each([
    ["another user", () => ["trainer", b.userId, a.workspaceId]],
    ["another workspace", () => ["trainer", a.userId, b.workspaceId]],
    ["another actor kind", () => ["platform_owner", a.userId, a.workspaceId]],
  ])("rejects a forged entry for %s", async (_label, values) => {
    const state = await withContext(app, a, (client) =>
      sqlState(client.query(insertAudit, values())),
    );

    expect(state).toBe("42501");
  });

  it("rejects entries from an empty context", async () => {
    const state = await withContext(app, {}, (client) =>
      sqlState(client.query(insertAudit, ["trainer", null, null])),
    );

    expect(state).toBe("42501");
  });

  it("never lets the app read, change or delete audit entries", async () => {
    for (const statement of [
      "select * from audit_logs",
      "update audit_logs set action = 'x'",
      "delete from audit_logs",
    ]) {
      expect(await withContext(app, a, (client) => sqlState(client.query(statement)))).toBe(
        "42501",
      );
    }
  });

  it("lets the system role read and insert but not change history", async () => {
    await committed(system, { actor: "system" }, (client) =>
      client.query(insertAudit, ["system", null, null]),
    );

    const count = Number(
      (await system.query("select count(*) from audit_logs where actor_kind = 'system'")).rows[0]
        .count,
    );
    expect(count).toBeGreaterThan(0);
    expect(await sqlState(system.query("update audit_logs set action = 'x'"))).toBe("42501");
    expect(await sqlState(system.query("delete from audit_logs"))).toBe("42501");
  });
});

describe("app.check_rate_limit", () => {
  let system: Pool;
  let app: Pool;

  beforeAll(() => {
    const db = inject("db");
    system = createPool(db.systemUrl);
    app = createPool(db.appUrl);
  });

  afterAll(async () => {
    await Promise.all([system.end(), app.end()]);
  });

  async function hit(key: string, max: number): Promise<boolean> {
    const { rows } = await system.query<{ allowed: boolean }>(
      "select app.check_rate_limit($1, 3600, $2) as allowed",
      [key, max],
    );
    const allowed = rows[0]?.allowed;
    if (allowed === undefined) throw new Error("check_rate_limit returned no row");
    return allowed;
  }

  it("allows up to the limit within a window, then refuses", async () => {
    const key = `login:ip:${randomUUID()}`;

    const results = [await hit(key, 3), await hit(key, 3), await hit(key, 3), await hit(key, 3)];

    expect(results).toEqual([true, true, true, false]);
  });

  it("counts keys independently", async () => {
    const first = `otp:email:${randomUUID()}`;
    await hit(first, 1);

    expect(await hit(`otp:email:${randomUUID()}`, 1)).toBe(true);
    expect(await hit(first, 1)).toBe(false);
  });

  it("rejects nonsense limits", async () => {
    expect(await sqlState(system.query("select app.check_rate_limit('k', 0, 5)"))).toBe("22023");
  });

  it("keeps the buckets invisible to fitcoach_app", async () => {
    expect(
      await withContext(app, {}, (client) =>
        sqlState(client.query("select * from rate_limit_buckets")),
      ),
    ).toBe("42501");
  });
});
