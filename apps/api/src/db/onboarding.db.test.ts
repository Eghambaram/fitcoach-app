import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertClient = `
  insert into clients (workspace_id, full_name, status, created_by_user_id)
  values ($1, 'Asha R', 'onboarding_draft', $2) returning id`;
const insertDraft = `
  insert into client_onboarding_drafts (workspace_id, client_id, step, data, created_by_user_id, finalized_at)
  values ($1, $2, 1, '{}', $3, $4) returning id`;
const insertConsent = `
  insert into client_consents (workspace_id, client_id, kind, status, notice_version, notice_text, source, actor_kind, actor_user_id)
  values ($1, $2, 'data_processing', 'granted', 1, 'I have the client''s consent to coach them.', 'onboarding', $3, $4)`;
const insertMeasurement = `
  insert into measurements (workspace_id, client_id, type_id, value, measured_on, source, recorded_by_user_id)
  values ($1, $2, $3, 72.5, current_date, $4, $5) returning id`;

describe("client onboarding tables (step 2.5)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let clientA: string;
  let weightType: string;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    clientA = await committed(app, trainerContext(a), async (client) => {
      const { rows } = await client.query<{ id: string }>(insertClient, [a.workspaceId, a.userId]);
      return rows[0]?.id ?? "";
    });
    const { rows } = await owner.query<{ id: string }>(
      "select id from measurement_types where workspace_id is null and key = 'weight'",
    );
    weightType = rows[0]?.id ?? "";
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("seeds the six global measurement types, readable by trainers and read-only", async () => {
    await withContext(app, trainerContext(b), async (client) => {
      const { rows } = await client.query<{ key: string }>(
        "select key from measurement_types order by sort_order",
      );
      expect(rows.map((row) => row.key)).toEqual([
        "weight",
        "height",
        "body_fat",
        "waist",
        "chest",
        "hips",
      ]);
      expect(await sqlStateIn(client, "update measurement_types set name = 'x'")).toBe("42501");
      expect(
        await sqlStateIn(
          client,
          "insert into measurement_types (workspace_id, key, name, unit_kind) values ($1, 'grip', 'Grip', 'mass')",
          [b.workspaceId],
        ),
      ).toBe("42501");
    });
  });

  it("keeps drafts per workspace, signed, one open per client, and final once finished", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const { rows } = await client.query<{ id: string }>(insertDraft, [
        a.workspaceId,
        clientA,
        a.userId,
        null,
      ]);
      expect(await sqlStateIn(client, insertDraft, [a.workspaceId, clientA, a.userId, null])).toBe(
        "23505",
      );
      expect(await sqlStateIn(client, insertDraft, [a.workspaceId, null, b.userId, null])).toBe(
        "42501",
      );
      expect(
        await sqlStateIn(client, insertDraft, [a.workspaceId, null, a.userId, new Date()]),
      ).toBe("42501");
      await client.query("update client_onboarding_drafts set finalized_at = now() where id = $1", [
        rows[0]?.id,
      ]);
      const after = await client.query(
        "update client_onboarding_drafts set step = 2 where id = $1",
        [rows[0]?.id],
      );
      expect(after.rowCount).toBe(0);
      expect(await sqlStateIn(client, "delete from client_onboarding_drafts")).toBe("42501");
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(await sqlStateIn(client, insertDraft, [b.workspaceId, clientA, b.userId, null])).toBe(
        "23503",
      );
      expect((await client.query("select 1 from client_onboarding_drafts")).rowCount).toBe(0);
    });
  });

  it("keeps consents append-only and signed by the trainer", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertConsent, [a.workspaceId, clientA, "trainer", a.userId]),
      ).toBeUndefined();
      expect(
        await sqlStateIn(client, insertConsent, [a.workspaceId, clientA, "client", a.userId]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertConsent, [a.workspaceId, clientA, "trainer", b.userId]),
      ).toBe("42501");
      expect(await sqlStateIn(client, "update client_consents set status = 'declined'")).toBe(
        "42501",
      );
      expect(await sqlStateIn(client, "delete from client_consents")).toBe("42501");
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(await sqlState(system.query("update client_consents set status = 'declined'"))).toBe(
        "42501",
      );
    } finally {
      await system.end();
    }
  });

  it("keeps measurements append-only: only voiding a live row, signed", async () => {
    const id = await committed(app, trainerContext(a), async (client) => {
      const { rows } = await client.query<{ id: string }>(insertMeasurement, [
        a.workspaceId,
        clientA,
        weightType,
        "trainer",
        a.userId,
      ]);
      return rows[0]?.id ?? "";
    });
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, "update measurements set value = 70 where id = $1", [id]),
      ).toBe("42501");
      expect(await sqlStateIn(client, "delete from measurements where id = $1", [id])).toBe(
        "42501",
      );
      expect(
        await sqlStateIn(
          client,
          "update measurements set voided_at = now(), voided_by_user_id = $2, void_reason = 'typo' where id = $1",
          [id, b.userId],
        ),
      ).toBe("42501");
      // Voiding needs a reason (CHECK), then the row is final.
      expect(
        await sqlStateIn(
          client,
          "update measurements set voided_at = now(), voided_by_user_id = $2 where id = $1",
          [id, a.userId],
        ),
      ).toBe("23514");
      await client.query(
        "update measurements set voided_at = now(), voided_by_user_id = $2, void_reason = 'typo' where id = $1",
        [id, a.userId],
      );
      const again = await client.query(
        "update measurements set void_reason = 'other' where id = $1",
        [id],
      );
      expect(again.rowCount).toBe(0);
      // Only trainer-sourced rows, signed as themselves.
      expect(
        await sqlStateIn(client, insertMeasurement, [
          a.workspaceId,
          clientA,
          weightType,
          "client",
          a.userId,
        ]),
      ).toBe("42501");
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect((await client.query("select 1 from measurements")).rowCount).toBe(0);
      expect(
        await sqlStateIn(client, insertMeasurement, [
          b.workspaceId,
          clientA,
          weightType,
          "trainer",
          b.userId,
        ]),
      ).toBe("23503");
    });
  });

  it("refuses a measurement type that belongs to another workspace", async () => {
    const { rows } = await owner.query<{ id: string }>(
      "insert into measurement_types (workspace_id, key, name, unit_kind) values ($1, 'grip', 'Grip', 'mass') returning id",
      [b.workspaceId],
    );
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertMeasurement, [
          a.workspaceId,
          clientA,
          rows[0]?.id,
          "trainer",
          a.userId,
        ]),
      ).toBe("23503");
    });
  });

  it("lets a trainer edit and activate their own client, never archive it here", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        (
          await client.query(
            "update clients set full_name = 'Asha Rao', status = 'active', onboarded_at = now() where id = $1",
            [clientA],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        await sqlStateIn(
          client,
          "update clients set status = 'archived', archived_at = now() where id = $1",
          [clientA],
        ),
      ).toBe("42501");
      // Active needs onboarded_at.
      expect(
        await sqlStateIn(client, "update clients set onboarded_at = null where id = $1", [clientA]),
      ).toBe("23514");
      expect(
        await sqlStateIn(client, "update clients set source_lead_id = null where id = $1", [
          clientA,
        ]),
      ).toBe("42501");
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        (await client.query("update clients set full_name = 'x' where id = $1", [clientA]))
          .rowCount,
      ).toBe(0);
    });
  });

  it("shows nothing to an empty context and keeps a suspended workspace read-only", async () => {
    await withContext(app, {}, async (client) => {
      for (const table of [
        "client_onboarding_drafts",
        "client_goals",
        "client_consents",
        "measurements",
      ]) {
        expect((await client.query(`select 1 from ${table}`)).rowCount).toBe(0);
      }
    });
    await owner.query("update workspaces set status = 'suspended' where id = $1", [a.workspaceId]);
    try {
      await withContext(app, trainerContext(a), async (client) => {
        expect(await sqlStateIn(client, insertDraft, [a.workspaceId, null, a.userId, null])).toBe(
          "42501",
        );
        expect(
          await sqlStateIn(client, insertMeasurement, [
            a.workspaceId,
            clientA,
            weightType,
            "trainer",
            a.userId,
          ]),
        ).toBe("42501");
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [a.workspaceId]);
    }
  });
});
