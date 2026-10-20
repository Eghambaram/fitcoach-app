import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { consumeBetaInvite, createBetaInvite } from "../modules/platform/beta-invites";
import { grantPlatformOwner } from "../modules/platform/platform-roles";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import {
  asSystem,
  createTrainer,
  drizzleFor,
  TEST_SESSION_SECRET,
  trainerContext,
} from "../test/fixtures";
import type { Database } from "./database";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

async function count(client: PoolClient, query: string, params: unknown[] = []): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n from (${query}) q`,
    params,
  );
  return rows[0]?.n ?? -1;
}

describe("auth & workspace tables RLS", () => {
  let owner: Pool;
  let app: Pool;
  let system: Pool;
  let systemDb: Database;
  let a: Trainer;
  let b: Trainer;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    system = createPool(db.systemUrl);
    systemDb = drizzleFor(system);
    a = await createTrainer(systemDb);
    b = await createTrainer(systemDb);
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end(), system.end()]);
  });

  it("copies the 7 default templates and 3 default presets into a new workspace", async () => {
    const own = await withContext(app, trainerContext(a), async (client) => ({
      templates: await count(client, "select 1 from message_templates where workspace_id = $1", [
        a.workspaceId,
      ]),
      presets: await count(client, "select 1 from package_presets where workspace_id = $1", [
        a.workspaceId,
      ]),
    }));

    expect(own).toEqual({ templates: 7, presets: 3 });
  });

  it("lets a trainer read their own workspace rows", async () => {
    const seen = await withContext(app, trainerContext(a), async (client) => ({
      users: await count(client, "select 1 from users"),
      profiles: await count(client, "select 1 from profiles"),
      workspaces: await count(client, "select 1 from workspaces"),
      members: await count(client, "select 1 from workspace_members"),
      settings: await count(client, "select 1 from trainer_settings"),
      plans: await count(client, "select 1 from workspace_plans"),
    }));

    expect(seen).toEqual({
      users: 1,
      profiles: 1,
      workspaces: 1,
      members: 1,
      settings: 1,
      plans: 1,
    });
  });

  it.each([
    ["users", "select 1 from users where id = $1", "userId"],
    ["profiles", "select 1 from profiles where user_id = $1", "userId"],
    ["workspaces", "select 1 from workspaces where id = $1", "workspaceId"],
    ["workspace_members", "select 1 from workspace_members where workspace_id = $1", "workspaceId"],
    ["trainer_settings", "select 1 from trainer_settings where workspace_id = $1", "workspaceId"],
    ["workspace_plans", "select 1 from workspace_plans where workspace_id = $1", "workspaceId"],
    ["message_templates", "select 1 from message_templates where workspace_id = $1", "workspaceId"],
    ["package_presets", "select 1 from package_presets where workspace_id = $1", "workspaceId"],
  ] as const)("hides trainer A's %s from trainer B", async (_table, query, key) => {
    const visible = await withContext(app, trainerContext(b), (client) =>
      count(client, query, [a[key]]),
    );

    expect(visible).toBe(0);
  });

  it("shows an empty context only the global reference data", async () => {
    const seen = await withContext(app, {}, async (client) => ({
      users: await count(client, "select 1 from users"),
      workspaces: await count(client, "select 1 from workspaces"),
      ownTemplates: await count(
        client,
        "select 1 from message_templates where workspace_id is not null",
      ),
      defaultTemplates: await count(
        client,
        "select 1 from message_templates where workspace_id is null",
      ),
      defaultPresets: await count(
        client,
        "select 1 from package_presets where workspace_id is null",
      ),
      plans: await count(client, "select 1 from subscription_plans"),
    }));

    expect(seen).toEqual({
      users: 0,
      workspaces: 0,
      ownTemplates: 0,
      defaultTemplates: 7,
      defaultPresets: 3,
      plans: 1,
    });
  });

  it("doesn't treat a client context as the trainer of the workspace", async () => {
    const visible = await withContext(app, { ...trainerContext(a), actor: "client" }, (client) =>
      count(client, "select 1 from workspaces"),
    );

    expect(visible).toBe(0);
  });

  it.each([
    "insert into workspaces (owner_user_id, slug, name, coaching_modes) values ($1, 'sneaky-slug', 'X Y', array['online'])",
    "insert into users (email) values ('sneaky@example.test')",
    "insert into workspace_members (workspace_id, user_id) values ($2, $1)",
    "select * from auth_tokens",
    "select * from beta_invites",
    "select * from platform_roles",
    "select * from email_outbox",
    "select * from notification_deliveries",
    "delete from message_templates where workspace_id = $1",
  ])("refuses fitcoach_app: %s", async (statement) => {
    const params = statement.includes("$2")
      ? [a.userId, a.workspaceId]
      : statement.startsWith("delete")
        ? [a.workspaceId]
        : statement.includes("$1")
          ? [a.userId]
          : [];
    const state = await withContext(app, trainerContext(a), (client) =>
      sqlState(client.query(statement, params)),
    );

    expect(state).toBe("42501");
  });

  it("lets a trainer edit their settings but not their workspace status or plan", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const renamed = await client.query(
        "update workspaces set name = 'Renamed Coaching' where id = $1",
        [a.workspaceId],
      );
      expect(renamed.rowCount).toBe(1);
      expect(
        await sqlStateIn(client, "update workspaces set status = 'active' where id = $1", [
          a.workspaceId,
        ]),
      ).toBe("42501");
      expect(await sqlStateIn(client, "update workspace_plans set max_active_clients = 9999")).toBe(
        "42501",
      );
      expect(await sqlStateIn(client, "update users set email_verified_at = now()")).toBe("42501");
    });
  });

  it("can't change another workspace's or the global templates", async () => {
    const changed = await withContext(app, trainerContext(b), async (client) => ({
      other: (
        await client.query("update message_templates set body = 'x' where workspace_id = $1", [
          a.workspaceId,
        ])
      ).rowCount,
      global: (
        await client.query("update message_templates set body = 'x' where workspace_id is null")
      ).rowCount,
    }));

    expect(changed).toEqual({ other: 0, global: 0 });
  });

  it("rejects writing a template into another workspace (tampering)", async () => {
    const state = await withContext(app, trainerContext(b), (client) =>
      sqlState(
        client.query(
          "insert into package_presets (workspace_id, name, kind, sessions_included) values ($1, 'X', 'session_pack', 5)",
          [a.workspaceId],
        ),
      ),
    );

    expect(state).toBe("42501");
  });

  it("makes a suspended workspace read-only at the database level", async () => {
    const suspended = await createTrainer(systemDb);
    await owner.query("update workspaces set status = 'suspended' where id = $1", [
      suspended.workspaceId,
    ]);

    await withContext(app, trainerContext(suspended), async (client) => {
      expect(
        await count(client, "select 1 from message_templates where workspace_id = $1", [
          suspended.workspaceId,
        ]),
      ).toBe(7);
      const updated = await client.query(
        "update message_templates set body = 'x' where workspace_id = $1",
        [suspended.workspaceId],
      );
      expect(updated.rowCount).toBe(0);
      expect(
        await sqlStateIn(
          client,
          "insert into package_presets (workspace_id, name, kind, duration_days) values ($1, 'X', 'time_based', 30)",
          [suspended.workspaceId],
        ),
      ).toBe("42501");
    });
  });

  it("lets a user revoke their own session but never extend one", async () => {
    const [session] = (
      await owner.query<{ id: string }>(
        "insert into sessions (token_hash, user_id, actor, workspace_id, expires_at) values ($1, $2, 'trainer', $3, now() + interval '1 day') returning id",
        [randomUUID(), a.userId, a.workspaceId],
      )
    ).rows;

    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(
          client,
          "update sessions set expires_at = now() + interval '10 years' where id = $1",
          [session?.id],
        ),
      ).toBe("42501");
      const revoked = await client.query(
        "update sessions set revoked_at = now(), revoked_reason = 'user_revoked' where id = $1",
        [session?.id],
      );
      expect(revoked.rowCount).toBe(1);
    });
    const otherUser = await withContext(app, trainerContext(b), (client) =>
      client.query("update sessions set revoked_at = now() where id = $1", [session?.id]),
    );
    expect(otherUser.rowCount).toBe(0);
  });

  it("records product events only for the request's own context and never reads them back", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const insert =
        "insert into product_events (event, actor_kind, user_id, workspace_id) values ('test_event', 'trainer', $1, $2)";
      expect(await sqlStateIn(client, insert, [a.userId, a.workspaceId])).toBeUndefined();
      expect(await sqlStateIn(client, insert, [b.userId, b.workspaceId])).toBe("42501");
      expect(await sqlStateIn(client, "select * from product_events")).toBe("42501");
    });
  });

  it("recorded trainer_signed_up for each new workspace", async () => {
    const { rows } = await owner.query<{ n: number }>(
      "select count(*)::int as n from product_events where event = 'trainer_signed_up' and workspace_id = any($1)",
      [[a.workspaceId, b.workspaceId]],
    );

    expect(rows[0]?.n).toBe(2);
  });
});

describe("beta invites", () => {
  let system: Pool;
  let systemDb: Database;

  beforeAll(() => {
    system = createPool(inject("db").systemUrl);
    systemDb = drizzleFor(system);
  });

  afterAll(async () => {
    await system.end();
  });

  function newInvite(maxUses: number, expiresInMs = 60_000) {
    return asSystem(systemDb, (tx) =>
      createBetaInvite(tx, TEST_SESSION_SECRET, {
        maxUses,
        expiresAt: new Date(Date.now() + expiresInMs),
        createdBy: "cli",
      }),
    );
  }

  it("accepts a code however it's typed, up to its use limit", async () => {
    const invite = await newInvite(2);
    const typed = ` ${invite.code.toLowerCase().replace(/-/g, " ")} `;

    const results = [];
    for (let i = 0; i < 3; i++) {
      results.push(
        await asSystem(systemDb, (tx) => consumeBetaInvite(tx, TEST_SESSION_SECRET, typed)),
      );
    }

    expect(results).toEqual([invite.id, invite.id, null]);
  });

  it("gives the last slot to exactly one of two simultaneous signups", async () => {
    const invite = await newInvite(1);

    const results = await Promise.all([
      asSystem(systemDb, (tx) => consumeBetaInvite(tx, TEST_SESSION_SECRET, invite.code)),
      asSystem(systemDb, (tx) => consumeBetaInvite(tx, TEST_SESSION_SECRET, invite.code)),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("rejects expired, unknown and revoked codes", async () => {
    const expired = await newInvite(5, -1_000);
    const revoked = await newInvite(5);
    await system.query("update beta_invites set revoked_at = now() where id = $1", [revoked.id]);

    for (const code of [expired.code, "FIT-ZZZZ-ZZZZ", revoked.code]) {
      expect(
        await asSystem(systemDb, (tx) => consumeBetaInvite(tx, TEST_SESSION_SECRET, code)),
      ).toBeNull();
    }
  });

  it("stores only a hash of the code and audits its creation", async () => {
    const invite = await newInvite(1);
    const { rows } = await system.query<{ code_hash: string; audited: number }>(
      `select code_hash, (select count(*)::int from audit_logs where target_id = $2 and action = 'beta_invite.created') as audited
       from beta_invites where id = $1`,
      [invite.id, invite.id],
    );

    expect(rows[0]?.code_hash).not.toContain(invite.code.replace(/-/g, ""));
    expect(rows[0]?.audited).toBe(1);
  });
});

describe("platform:grant", () => {
  let system: Pool;
  let systemDb: Database;

  beforeAll(() => {
    system = createPool(inject("db").systemUrl);
    systemDb = drizzleFor(system);
  });

  afterAll(async () => {
    await system.end();
  });

  it("refuses unknown emails, grants once, and audits the grant", async () => {
    const trainer = await createTrainer(systemDb);

    const unknown = await asSystem(systemDb, (tx) =>
      grantPlatformOwner(tx, "nobody@example.test", "cli:test"),
    );
    const first = await asSystem(systemDb, (tx) =>
      grantPlatformOwner(tx, trainer.email.toUpperCase(), "cli:test"),
    );
    const second = await asSystem(systemDb, (tx) =>
      grantPlatformOwner(tx, trainer.email, "cli:test"),
    );

    expect(unknown).toEqual({ status: "no_account" });
    expect(first).toEqual({ status: "granted", userId: trainer.userId });
    expect(second).toEqual({ status: "already_granted", userId: trainer.userId });
    const audited = await committed(system, { actor: "system" }, (client) =>
      client.query(
        "select 1 from audit_logs where action = 'platform_role.granted' and target_id = $1",
        [trainer.userId],
      ),
    );
    expect(audited.rowCount).toBe(1);
  });
});
