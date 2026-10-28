import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertClient = `insert into clients (workspace_id, full_name, phone_e164, status, created_by_user_id, onboarded_at)
  values ($1, $2, $3, 'active', $4, now()) returning id`;
const insertMeasurement = `insert into measurements (workspace_id, client_id, type_id, value, measured_on, source, recorded_by_user_id)
  values ($1, $2, $3, $4, $5, $6, $7) returning id`;

describe("progress sharing and measurements (step 4.4)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let asha: string;
  let clientUser: string;
  let weight: string;
  let waist: string;
  let customA: string;

  const portal = () => ({
    userId: clientUser,
    workspaceId: a.workspaceId,
    clientId: asha,
    actor: "client" as const,
  });
  const setSelfLogging = (on: boolean) =>
    owner.query(
      `update clients set features = jsonb_set(features, '{progressSelfLogging}', $1::jsonb) where id = $2`,
      [on ? "true" : "false", asha],
    );

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    const types = await owner.query<{ id: string; key: string }>(
      "select id, key from measurement_types where workspace_id is null",
    );
    weight = types.rows.find((row) => row.key === "weight")?.id ?? "";
    waist = types.rows.find((row) => row.key === "waist")?.id ?? "";
    const user = await owner.query<{ id: string }>(
      "insert into users (email) values (null) returning id",
    );
    clientUser = user.rows[0]?.id ?? "";
    [asha, customA] = await committed(app, trainerContext(a), async (client) => {
      const created = await client.query<{ id: string }>(insertClient, [
        a.workspaceId,
        "Asha Rao",
        "+919877700001",
        a.userId,
      ]);
      const id = created.rows[0]?.id ?? "";
      const custom = await client.query<{ id: string }>(
        `insert into measurement_types (workspace_id, key, name, unit_kind) values ($1, 'arm', 'Arm', 'length') returning id`,
        [a.workspaceId],
      );
      for (const [type, value, day] of [
        [weight, 72, "2026-01-01"],
        [weight, 70, "2026-02-01"],
        [waist, 84, "2026-01-01"],
      ] as const) {
        await client.query(insertMeasurement, [
          a.workspaceId,
          id,
          type,
          value,
          day,
          "trainer",
          a.userId,
        ]);
      }
      await client.query(
        "insert into progress_shares (workspace_id, client_id, type_id, created_by_user_id) values ($1, $2, $3, $4)",
        [a.workspaceId, id, weight, a.userId],
      );
      return [id, custom.rows[0]?.id ?? ""];
    });
    await owner.query("update clients set user_id = $1 where id = $2", [clientUser, asha]);
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("shows a client only the metrics shared with them", async () => {
    await withContext(app, portal(), async (client) => {
      const rows = await client.query<{ type_id: string }>("select type_id from measurements");
      expect(new Set(rows.rows.map((row) => row.type_id))).toEqual(new Set([weight]));
      expect(rows.rowCount).toBe(2);
      const shares = await client.query<{ type_id: string }>("select type_id from progress_shares");
      expect(shares.rows.map((row) => row.type_id)).toEqual([weight]);
      // A client can't share more with themselves, or change history.
      expect(
        await sqlStateIn(
          client,
          "insert into progress_shares (workspace_id, client_id, type_id, created_by_user_id) values ($1, $2, $3, $4)",
          [a.workspaceId, asha, waist, clientUser],
        ),
      ).toBe("42501");
      expect((await client.query("update measurements set voided_at = now()")).rowCount).toBe(0);
      expect(await sqlStateIn(client, "update measurements set value = 1")).toBe("42501");
      expect(
        (await client.query("select 1 from measurement_types where id = $1", [customA])).rowCount,
      ).toBe(1);
    });
  });

  it("lets a client add values only with self-logging on, only for shared metrics", async () => {
    const own = (type: string, source = "client") =>
      [a.workspaceId, asha, type, 69.5, "2026-03-01", source, clientUser] as unknown[];
    await setSelfLogging(false);
    await withContext(app, portal(), async (client) => {
      expect(await sqlStateIn(client, insertMeasurement, own(weight))).toBe("42501");
    });
    await setSelfLogging(true);
    try {
      await withContext(app, portal(), async (client) => {
        expect(await sqlStateIn(client, insertMeasurement, own(weight, "trainer"))).toBe("42501");
        expect(await sqlStateIn(client, insertMeasurement, own(waist))).toBe("42501");
        expect(await sqlStateIn(client, insertMeasurement, own(weight))).toBeUndefined();
      });
    } finally {
      await setSelfLogging(false);
    }
  });

  it("keeps custom types, shares and measurements inside the workspace", async () => {
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        (await client.query("select 1 from measurement_types where id = $1", [customA])).rowCount,
      ).toBe(0);
      expect((await client.query("select 1 from progress_shares")).rowCount).toBe(0);
      expect((await client.query("select 1 from measurements")).rowCount).toBe(0);
      const own = await client.query<{ id: string }>(insertClient, [
        b.workspaceId,
        "Meera S",
        "+919877700002",
        b.userId,
      ]);
      expect(
        await sqlStateIn(client, insertMeasurement, [
          b.workspaceId,
          own.rows[0]?.id,
          customA,
          30,
          "2026-01-01",
          "trainer",
          b.userId,
        ]),
      ).toBe("23503");
      expect(
        await sqlStateIn(
          client,
          "insert into progress_shares (workspace_id, client_id, type_id, created_by_user_id) values ($1, $2, $3, $4)",
          [b.workspaceId, own.rows[0]?.id, customA, b.userId],
        ),
      ).toBe("23503");
      expect(
        (await client.query("update measurement_types set name = 'x' where id = $1", [customA]))
          .rowCount,
      ).toBe(0);
    });
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        (await client.query("update measurement_types set name = 'x' where workspace_id is null"))
          .rowCount,
      ).toBe(0);
      expect(await sqlStateIn(client, "delete from measurements")).toBe("42501");
      expect(await sqlStateIn(client, "update measurements set value = 1")).toBe("42501");
      expect(
        (await client.query("delete from progress_shares where client_id = $1", [asha])).rowCount,
      ).toBe(1);
    });
    await withContext(app, {}, async (client) => {
      expect((await client.query("select 1 from progress_shares")).rowCount).toBe(0);
      expect((await client.query("select 1 from measurements")).rowCount).toBe(0);
    });
  });
});
