import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertClient = `insert into clients (workspace_id, full_name, phone_e164, status, created_by_user_id, onboarded_at)
  values ($1, $2, $3, 'active', $4, now()) returning id`;
const insertToday = `insert into check_ins (workspace_id, client_id, local_date, feeling, energy, sleep, soreness)
  values ($1, $2, app.workspace_today(), 'good', 7, 6, 'mild') returning id`;

describe("check-ins (step 4.3)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let asha: string;
  let ravi: string;

  const portal = (clientId: string) => ({
    userId: a.userId,
    workspaceId: a.workspaceId,
    clientId,
    actor: "client" as const,
  });
  const setCheckIns = (clientId: string, on: boolean) =>
    owner.query(
      `update clients set features = jsonb_set(features, '{checkIns}', $1::jsonb) where id = $2`,
      [on ? "true" : "false", clientId],
    );

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    [asha, ravi] = await committed(app, trainerContext(a), async (client) => {
      const one = await client.query<{ id: string }>(insertClient, [
        a.workspaceId,
        "Asha Rao",
        "+919866600001",
        a.userId,
      ]);
      const two = await client.query<{ id: string }>(insertClient, [
        a.workspaceId,
        "Ravi K",
        "+919866600002",
        a.userId,
      ]);
      return [one.rows[0]?.id ?? "", two.rows[0]?.id ?? ""];
    });
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("lets a client send one check-in for today, only for themselves and only when enabled", async () => {
    await withContext(app, portal(asha), async (client) => {
      expect(
        await sqlStateIn(
          client,
          `insert into check_ins (workspace_id, client_id, local_date, feeling, energy, sleep, soreness)
           values ($1, $2, app.workspace_today() - 1, 'good', 7, 6, 'mild')`,
          [a.workspaceId, asha],
        ),
      ).toBe("42501");
      expect(await sqlStateIn(client, insertToday, [a.workspaceId, ravi])).toBe("42501");
      await client.query(insertToday, [a.workspaceId, asha]);
      expect(await sqlStateIn(client, insertToday, [a.workspaceId, asha])).toBe("23505");
      expect(
        await sqlStateIn(
          client,
          `insert into check_ins (workspace_id, client_id, local_date, feeling, energy, sleep, soreness, reply)
           values ($1, $2, app.workspace_today(), 'good', 7, 6, 'mild', 'x')`,
          [a.workspaceId, asha],
        ),
      ).toBe("42501"); // a client never writes the reply
    });
    await setCheckIns(asha, false);
    try {
      await withContext(app, portal(asha), async (client) => {
        expect(await sqlStateIn(client, insertToday, [a.workspaceId, asha])).toBe("42501");
      });
    } finally {
      await setCheckIns(asha, true);
    }
  });

  it("keeps every same-day edit, sends it back for review, and keeps the review the trainer's", async () => {
    const id = await committed(app, portal(ravi), async (client) => {
      const created = await client.query<{ id: string }>(insertToday, [a.workspaceId, ravi]);
      return created.rows[0]?.id ?? "";
    });
    await committed(app, trainerContext(a), async (client) => {
      expect(await sqlStateIn(client, "update check_ins set energy = 1 where id = $1", [id])).toBe(
        "42501",
      );
      expect(
        await sqlStateIn(
          client,
          "update check_ins set reviewed_at = now(), reviewed_by_user_id = $2 where id = $1",
          [id, b.userId],
        ),
      ).toBe("42501");
      await client.query(
        "update check_ins set reviewed_at = now(), reviewed_by_user_id = $2, reply = 'Nice' where id = $1",
        [id, a.userId],
      );
    });
    await committed(app, portal(ravi), async (client) => {
      expect(
        await sqlStateIn(client, "update check_ins set reply = 'mine' where id = $1", [id]),
      ).toBe("42501");
      expect(
        (await client.query("update check_ins set energy = 9 where id = $1", [id])).rowCount,
      ).toBe(1);
    });
    const row = await owner.query(
      "select energy, revisions, reviewed_at, reply from check_ins where id = $1",
      [id],
    );
    expect(row.rows[0]).toMatchObject({
      energy: 9,
      revisions: 1,
      reviewed_at: null,
      reply: "Nice",
    });
    await withContext(app, trainerContext(a), async (client) => {
      const revisions = await client.query<{ previous: { energy: number } }>(
        "select previous from check_in_revisions where check_in_id = $1",
        [id],
      );
      expect(revisions.rows.map((r) => r.previous.energy)).toEqual([7]);
      expect(
        await sqlStateIn(
          client,
          "insert into check_in_revisions (workspace_id, check_in_id, previous) values ($1, $2, '{}')",
          [a.workspaceId, id],
        ),
      ).toBe("42501");
      expect(await sqlStateIn(client, "delete from check_ins")).toBe("42501");
    });
    // Yesterday's check-in can no longer be edited.
    await owner.query("update check_ins set local_date = local_date - 1 where id = $1", [id]);
    await withContext(app, portal(ravi), async (client) => {
      expect(
        (await client.query("update check_ins set energy = 2 where id = $1", [id])).rowCount,
      ).toBe(0);
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(await sqlState(system.query("delete from check_in_revisions"))).toBe("42501");
    } finally {
      await system.end();
    }
  });

  it("keeps check-ins inside the workspace and the client", async () => {
    await committed(app, portal(asha), (client) =>
      client.query(insertToday, [a.workspaceId, asha]),
    );
    await withContext(app, trainerContext(b), async (client) => {
      expect((await client.query("select 1 from check_ins")).rowCount).toBe(0);
      expect((await client.query("select 1 from check_in_revisions")).rowCount).toBe(0);
      expect((await client.query("update check_ins set reviewed_at = now()")).rowCount).toBe(0);
    });
    await withContext(app, portal(asha), async (client) => {
      const rows = await client.query<{ client_id: string }>("select client_id from check_ins");
      expect(new Set(rows.rows.map((row) => row.client_id))).toEqual(new Set([asha]));
      expect((await client.query("select 1 from check_in_revisions")).rowCount).toBe(0);
    });
    await withContext(app, {}, async (client) => {
      expect((await client.query("select 1 from check_ins")).rowCount).toBe(0);
    });
  });
});
