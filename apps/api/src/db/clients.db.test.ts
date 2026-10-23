import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertLead = `
  insert into leads (workspace_id, full_name, phone_e164, goal, source, created_via, created_by_user_id)
  values ($1, 'Meena S', $2, 'lose_weight', 'walk_in', 'manual', $3)
  returning id`;
const insertClient = `
  insert into clients (workspace_id, full_name, phone_e164, status, created_by_user_id, user_id, source_lead_id)
  values ($1, 'Meena S', $2, $3, $4, $5, $6)
  returning id`;

let phoneCounter = 0;
const phone = () =>
  `+9198${String(Date.now() % 100_000_000)
    .padStart(8, "0")
    .slice(0, 6)}${String(phoneCounter++).padStart(2, "0")}`;

async function idOf(client: PoolClient, query: string, params: unknown[]): Promise<string> {
  const { rows } = await client.query<{ id: string }>(query, params);
  return rows[0]?.id ?? "";
}

describe("clients, activity events and conversion (step 2.4)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("lets a trainer add clients only in their own workspace, as themselves, without a login", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const ok = [a.workspaceId, phone(), "onboarding_draft", a.userId, null, null];
      expect(await sqlStateIn(client, insertClient, ok)).toBeUndefined();
      expect(
        await sqlStateIn(client, insertClient, [
          b.workspaceId,
          phone(),
          "active",
          a.userId,
          null,
          null,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertClient, [
          a.workspaceId,
          phone(),
          "active",
          b.userId,
          null,
          null,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertClient, [
          a.workspaceId,
          phone(),
          "active",
          a.userId,
          a.userId,
          null,
        ]),
      ).toBe("42501");
      // No edits or deletes yet; those arrive with their screens.
      expect(await sqlStateIn(client, "update clients set full_name = 'x'")).toBe("42501");
      expect(await sqlStateIn(client, "delete from clients")).toBe("42501");
    });
  });

  it("keeps phone numbers unique among a workspace's non-archived clients", async () => {
    const number = phone();
    await withContext(app, trainerContext(a), async (client) => {
      await client.query(insertClient, [a.workspaceId, number, "active", a.userId, null, null]);
      expect(
        await sqlStateIn(client, insertClient, [
          a.workspaceId,
          number,
          "onboarding_draft",
          a.userId,
          null,
          null,
        ]),
      ).toBe("23505");
    });
    // Another workspace may have the same number.
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        await sqlStateIn(client, insertClient, [
          b.workspaceId,
          number,
          "active",
          b.userId,
          null,
          null,
        ]),
      ).toBeUndefined();
    });
  });

  it("enforces the plan's active-client limit on every activation", async () => {
    await owner.query("update workspace_plans set max_active_clients = 1 where workspace_id = $1", [
      b.workspaceId,
    ]);
    try {
      await withContext(app, trainerContext(b), async (client) => {
        await client.query(insertClient, [b.workspaceId, phone(), "active", b.userId, null, null]);
        expect(
          await sqlStateIn(client, insertClient, [
            b.workspaceId,
            phone(),
            "active",
            b.userId,
            null,
            null,
          ]),
        ).toBe("FC001");
        // Drafts don't take an active slot.
        expect(
          await sqlStateIn(client, insertClient, [
            b.workspaceId,
            phone(),
            "onboarding_draft",
            b.userId,
            null,
            null,
          ]),
        ).toBeUndefined();
      });
    } finally {
      await owner.query(
        "update workspace_plans set max_active_clients = 50 where workspace_id = $1",
        [b.workspaceId],
      );
    }
  });

  it("marks a lead converted only with a client of the same workspace, signed by the caller", async () => {
    const [leadA, clientA] = await committed(app, trainerContext(a), async (client) => {
      const lead = await idOf(client, insertLead, [a.workspaceId, phone(), a.userId]);
      const created = await idOf(client, insertClient, [
        a.workspaceId,
        null,
        "onboarding_draft",
        a.userId,
        null,
        lead,
      ]);
      return [lead, created];
    });
    const clientB = await committed(app, trainerContext(b), (client) =>
      idOf(client, insertClient, [b.workspaceId, null, "onboarding_draft", b.userId, null, null]),
    );
    const convert = `update leads set stage = 'converted', converted_client_id = $2, converted_at = now(),
      converted_by_user_id = $3 where id = $1`;

    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, "update leads set stage = 'converted' where id = $1", [leadA]),
      ).toBe("42501");
      expect(await sqlStateIn(client, convert, [leadA, clientA, b.userId])).toBe("42501");
      expect(await sqlStateIn(client, convert, [leadA, clientB, a.userId])).toBe("23503");
      // One client per lead.
      expect(
        await sqlStateIn(client, insertClient, [
          a.workspaceId,
          null,
          "onboarding_draft",
          a.userId,
          null,
          leadA,
        ]),
      ).toBe("23505");
    });
    await committed(app, trainerContext(a), (client) =>
      client.query(convert, [leadA, clientA, a.userId]),
    );
    // A converted lead is final.
    await withContext(app, trainerContext(a), async (client) => {
      const reopened = await client.query("update leads set stage = 'new' where id = $1", [leadA]);
      expect(reopened.rowCount).toBe(0);
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect((await client.query("select 1 from clients where id = $1", [clientA])).rowCount).toBe(
        0,
      );
    });
  });

  it("keeps activity events insert-only and per workspace", async () => {
    const insertEvent = `insert into activity_events (workspace_id, type, client_id, actor_user_id)
      values ($1, 'lead_converted', $2, $3)`;
    const clientA = await committed(app, trainerContext(a), (client) =>
      idOf(client, insertClient, [a.workspaceId, null, "onboarding_draft", a.userId, null, null]),
    );
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertEvent, [a.workspaceId, clientA, a.userId]),
      ).toBeUndefined();
      expect(await sqlStateIn(client, insertEvent, [a.workspaceId, clientA, b.userId])).toBe(
        "42501",
      );
      expect(await sqlStateIn(client, "update activity_events set data = '{}'")).toBe("42501");
      expect(await sqlStateIn(client, "delete from activity_events")).toBe("42501");
    });
    await withContext(app, trainerContext(b), async (client) => {
      // B can't attach an event to A's client, even under B's own workspace.
      expect(await sqlStateIn(client, insertEvent, [b.workspaceId, clientA, b.userId])).toBe(
        "23503",
      );
      expect((await client.query("select 1 from activity_events")).rowCount).toBe(0);
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(await sqlState(system.query("delete from clients"))).toBe("42501");
      expect(await sqlState(system.query("update activity_events set data = '{}'"))).toBe("42501");
    } finally {
      await system.end();
    }
  });

  it("shows nothing to an empty context or a client context", async () => {
    await withContext(app, {}, async (client) => {
      expect((await client.query("select 1 from clients")).rowCount).toBe(0);
      expect((await client.query("select 1 from activity_events")).rowCount).toBe(0);
    });
    await withContext(
      app,
      { userId: a.userId, workspaceId: a.workspaceId, actor: "client" },
      async (client) => {
        expect((await client.query("select 1 from clients")).rowCount).toBe(0);
      },
    );
  });

  it("keeps a suspended workspace read-only", async () => {
    await owner.query("update workspaces set status = 'suspended' where id = $1", [b.workspaceId]);
    try {
      await withContext(app, trainerContext(b), async (client) => {
        expect(
          await sqlStateIn(client, insertClient, [
            b.workspaceId,
            phone(),
            "onboarding_draft",
            b.userId,
            null,
            null,
          ]),
        ).toBe("42501");
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [b.workspaceId]);
    }
  });
});
