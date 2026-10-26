import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertClient = `insert into clients (workspace_id, full_name, phone_e164, status, created_by_user_id, onboarded_at)
  values ($1, 'Asha R', $2, 'active', $3, now()) returning id`;
const insertNote = `insert into client_notes (workspace_id, client_id, body, author_user_id) values ($1, $2, $3, $4)`;

describe("client lifecycle and notes (step 3.1)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let clientA: string;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    clientA = await committed(app, trainerContext(a), async (client) => {
      const { rows } = await client.query<{ id: string }>(insertClient, [
        a.workspaceId,
        "+919811100001",
        a.userId,
      ]);
      return rows[0]?.id ?? "";
    });
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("archives and restores a trainer's own client, keeping status and archived_at together", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        (
          await client.query(
            "update clients set status = 'archived', archived_at = now() where id = $1",
            [clientA],
          )
        ).rowCount,
      ).toBe(1);
      // An archived client's number is free for a new client…
      expect(
        await sqlStateIn(client, insertClient, [a.workspaceId, "+919811100001", a.userId]),
      ).toBeUndefined();
      // …so restoring the old one now clashes on the partial unique index.
      expect(
        await sqlStateIn(
          client,
          "update clients set status = 'active', archived_at = null where id = $1",
          [clientA],
        ),
      ).toBe("23505");
      expect(
        await sqlStateIn(client, "update clients set archived_at = null where id = $1", [clientA]),
      ).toBe("23514");
    });
    await withContext(app, trainerContext(b), async (client) => {
      const tampered = await client.query(
        "update clients set status = 'archived', archived_at = now() where id = $1",
        [clientA],
      );
      expect(tampered.rowCount).toBe(0);
    });
  });

  it("keeps private notes append-only, signed and per workspace", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertNote, [a.workspaceId, clientA, "Left knee", a.userId]),
      ).toBeUndefined();
      expect(await sqlStateIn(client, insertNote, [a.workspaceId, clientA, "x", b.userId])).toBe(
        "42501",
      );
      expect(await sqlStateIn(client, insertNote, [a.workspaceId, clientA, "", a.userId])).toBe(
        "23514",
      );
      expect(await sqlStateIn(client, "update client_notes set body = 'x'")).toBe("42501");
      expect(await sqlStateIn(client, "delete from client_notes")).toBe("42501");
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(await sqlStateIn(client, insertNote, [b.workspaceId, clientA, "x", b.userId])).toBe(
        "23503",
      );
      expect((await client.query("select 1 from client_notes")).rowCount).toBe(0);
    });
    await withContext(app, {}, async (client) => {
      expect((await client.query("select 1 from client_notes")).rowCount).toBe(0);
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(await sqlState(system.query("update client_notes set body = 'x'"))).toBe("42501");
    } finally {
      await system.end();
    }
  });

  it("keeps a suspended workspace's clients read-only", async () => {
    await owner.query("update workspaces set status = 'suspended' where id = $1", [a.workspaceId]);
    try {
      await withContext(app, trainerContext(a), async (client) => {
        expect(
          (await client.query("update clients set status = 'paused' where id = $1", [clientA]))
            .rowCount,
        ).toBe(0);
        expect(await sqlStateIn(client, insertNote, [a.workspaceId, clientA, "x", a.userId])).toBe(
          "42501",
        );
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [a.workspaceId]);
    }
  });
});
