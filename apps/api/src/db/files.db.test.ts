import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPool, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertFile = `
  insert into files (workspace_id, uploaded_by_user_id, kind, bucket, object_key, mime_type, size_bytes, width, height, checksum)
  values ($1, $2, 'trainer_avatar', 'public', $3, 'image/webp', 1000, 10, 10, 'sum')
  returning id`;

describe("files ledger RLS", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let fileA: string;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    const { rows } = await owner.query<{ id: string }>(insertFile, [
      a.workspaceId,
      a.userId,
      `test/${randomUUID()}.webp`,
    ]);
    fileA = rows[0]?.id ?? "";
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("shows a trainer only their workspace's files", async () => {
    const seen = await withContext(
      app,
      trainerContext(b),
      async (client) =>
        (await client.query("select id from files where id = $1", [fileA])).rowCount,
    );
    const own = await withContext(
      app,
      trainerContext(a),
      async (client) =>
        (await client.query("select id from files where id = $1", [fileA])).rowCount,
    );
    const empty = await withContext(
      app,
      {},
      async (client) => (await client.query("select id from files")).rowCount,
    );

    expect({ seen, own, empty }).toEqual({ seen: 0, own: 1, empty: 0 });
  });

  it("records uploads only for the trainer's own workspace and user (tampering)", async () => {
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        await sqlStateIn(client, insertFile, [
          b.workspaceId,
          b.userId,
          `test/${randomUUID()}.webp`,
        ]),
      ).toBeUndefined();
      expect(
        await sqlStateIn(client, insertFile, [
          a.workspaceId,
          b.userId,
          `test/${randomUUID()}.webp`,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertFile, [
          b.workspaceId,
          a.userId,
          `test/${randomUUID()}.webp`,
        ]),
      ).toBe("42501");
    });
  });

  it("only soft-deletes: no hard delete, no edits to the ledger", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(await sqlStateIn(client, "delete from files where id = $1", [fileA])).toBe("42501");
      expect(
        await sqlStateIn(client, "update files set size_bytes = 1 where id = $1", [fileA]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, "update files set purged_at = now() where id = $1", [fileA]),
      ).toBe("42501");
      expect(
        (await client.query("update files set deleted_at = now() where id = $1", [fileA])).rowCount,
      ).toBe(1);
    });
  });

  it("won't let a profile point at another user's file", async () => {
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        await sqlStateIn(client, "update profiles set avatar_file_id = $1 where user_id = $2", [
          fileA,
          b.userId,
        ]),
      ).toBe("23503");
    });
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, "update profiles set avatar_file_id = $1 where user_id = $2", [
          fileA,
          a.userId,
        ]),
      ).toBeUndefined();
    });
  });

  it("refuses uploads in a suspended workspace", async () => {
    await owner.query("update workspaces set status = 'suspended' where id = $1", [b.workspaceId]);
    try {
      await withContext(app, trainerContext(b), async (client) => {
        expect(
          await sqlStateIn(client, insertFile, [
            b.workspaceId,
            b.userId,
            `test/${randomUUID()}.webp`,
          ]),
        ).toBe("42501");
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [b.workspaceId]);
    }
  });

  it("keeps public and private kinds in their buckets", async () => {
    const state = await owner
      .query(
        `insert into files (kind, bucket, object_key, mime_type, size_bytes, width, height, checksum)
         values ('client_avatar', 'public', $1, 'image/webp', 1, 1, 1, 'x')`,
        [`test/${randomUUID()}.webp`],
      )
      .then(
        () => undefined,
        (error: { code?: string }) => error.code,
      );

    expect(state).toBe("23514");
  });
});
