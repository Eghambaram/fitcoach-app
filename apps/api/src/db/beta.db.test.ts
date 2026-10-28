import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertFeedback = `insert into feedback (workspace_id, user_id, page, message, status)
  values ($1, $2, '/app', 'The calendar is great', $3)`;
const insertExport = `insert into data_exports (workspace_id, requested_by_user_id, status, object_key)
  values ($1, $2, $3, $4)`;

describe("feedback and data exports (step 5.3)", () => {
  let owner: Pool;
  let app: Pool;
  let system: Pool;
  let a: Trainer;
  let b: Trainer;
  let clientUser: string;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    const users = await owner.query<{ id: string }>(
      "insert into users (email) values (null) returning id",
    );
    clientUser = users.rows[0]?.id ?? "";
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end(), system.end()]);
  });

  it("lets a trainer send feedback as themselves, and never read it back", async () => {
    await committed(app, trainerContext(a), (client) =>
      client.query(insertFeedback, [a.workspaceId, a.userId, "open"]),
    );
    await withContext(app, trainerContext(a), async (client) => {
      // Not signed as someone else, not into another workspace, not pre-triaged.
      expect(await sqlStateIn(client, insertFeedback, [a.workspaceId, b.userId, "open"])).toBe(
        "42501",
      );
      expect(await sqlStateIn(client, insertFeedback, [b.workspaceId, a.userId, "open"])).toBe(
        "42501",
      );
      expect(await sqlStateIn(client, insertFeedback, [a.workspaceId, a.userId, "closed"])).toBe(
        "42501",
      );
      expect(await sqlStateIn(client, "select 1 from feedback")).toBe("42501");
      expect(await sqlStateIn(client, "update feedback set status = 'closed'")).toBe("42501");
      expect(await sqlStateIn(client, "delete from feedback")).toBe("42501");
    });
    await withContext(
      app,
      { userId: clientUser, workspaceId: a.workspaceId, actor: "client" },
      async (client) => {
        expect(await sqlStateIn(client, insertFeedback, [a.workspaceId, clientUser, "open"])).toBe(
          "42501",
        );
      },
    );
    await withContext(app, {}, async (client) => {
      expect(await sqlStateIn(client, insertFeedback, [a.workspaceId, a.userId, "open"])).toBe(
        "42501",
      );
    });
    // The platform owner (system) triages it but can't delete it.
    const triaged = await system.query(
      "update feedback set status = 'triaged' where workspace_id = $1",
      [a.workspaceId],
    );
    expect(triaged.rowCount).toBe(1);
    expect(await sqlState(system.query("delete from feedback"))).toBe("42501");
  });

  it("rejects empty or oversized feedback and full URLs as the page", async () => {
    expect(
      await sqlState(
        system.query(
          "insert into feedback (workspace_id, user_id, message) values ($1, $2, 'hi')",
          [a.workspaceId, a.userId],
        ),
      ),
    ).toBe("23514");
    expect(
      await sqlState(
        system.query(
          "insert into feedback (workspace_id, user_id, message, page) values ($1, $2, 'Hello there', 'https://evil.example')",
          [a.workspaceId, a.userId],
        ),
      ),
    ).toBe("23514");
  });

  it("lets a trainer ask for exports and see only their workspace's; the job fills them in", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertExport, [a.workspaceId, a.userId, "pending", null]),
      ).toBeUndefined();
      // Can't fake a finished export pointing at some object, or ask on another's behalf.
      expect(
        await sqlStateIn(client, insertExport, [a.workspaceId, a.userId, "ready", "exports/x.zip"]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertExport, [b.workspaceId, a.userId, "pending", null]),
      ).toBe("42501");
      expect(await sqlStateIn(client, "update data_exports set object_key = 'x'")).toBe("42501");
      expect(await sqlStateIn(client, "delete from data_exports")).toBe("42501");
    });
    await system.query(insertExport, [a.workspaceId, a.userId, "pending", null]);
    await system.query(insertExport, [b.workspaceId, b.userId, "pending", null]);
    await withContext(app, trainerContext(a), async (client) => {
      const seen = await client.query<{ workspace_id: string }>(
        "select workspace_id from data_exports",
      );
      expect(new Set(seen.rows.map((row) => row.workspace_id))).toEqual(new Set([a.workspaceId]));
    });
    await withContext(app, {}, async (client) => {
      expect((await client.query("select 1 from data_exports")).rowCount).toBe(0);
    });
    await withContext(
      app,
      { userId: clientUser, workspaceId: a.workspaceId, actor: "client" },
      async (client) => {
        expect((await client.query("select 1 from data_exports")).rowCount).toBe(0);
      },
    );
    // A ready export needs its object key and expiry.
    expect(
      await sqlState(
        system.query("update data_exports set status = 'ready' where workspace_id = $1", [
          b.workspaceId,
        ]),
      ),
    ).toBe("23514");
    const ready = await system.query(
      `update data_exports set status = 'ready', object_key = 'exports/b.zip',
         expires_at = now() + interval '1 day' where workspace_id = $1`,
      [b.workspaceId],
    );
    expect(ready.rowCount).toBe(1);
  });
});
