import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertLead = `
  insert into leads (workspace_id, full_name, phone_e164, goal, source, created_via, created_by_user_id, stage)
  values ($1, 'Meena S', '+919812345678', 'lose_weight', 'walk_in', $2, $3, $4)
  returning id`;

describe("lead CRM writes (step 2.2)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let leadA: string;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    leadA = await committed(app, trainerContext(a), async (client) => {
      const { rows } = await client.query<{ id: string }>(insertLead, [
        a.workspaceId,
        "manual",
        a.userId,
        "new",
      ]);
      return rows[0]?.id ?? "";
    });
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("lets a trainer add manual leads only in their own workspace, as themselves", async () => {
    await withContext(app, trainerContext(b), async (client) => {
      expect(await sqlStateIn(client, insertLead, [b.workspaceId, "manual", b.userId, "new"])).toBe(
        undefined,
      );
      // Another workspace, a forged origin, another author, or a pre-converted lead: all refused.
      expect(await sqlStateIn(client, insertLead, [a.workspaceId, "manual", b.userId, "new"])).toBe(
        "42501",
      );
      expect(
        await sqlStateIn(client, insertLead, [b.workspaceId, "public_page", b.userId, "new"]),
      ).toBe("42501");
      expect(await sqlStateIn(client, insertLead, [b.workspaceId, "manual", a.userId, "new"])).toBe(
        "42501",
      );
      expect(
        await sqlStateIn(client, insertLead, [b.workspaceId, "manual", b.userId, "converted"]),
      ).toBe("42501");
    });
  });

  it("lets a trainer edit and change stage of their own leads, but never to converted", async () => {
    await withContext(app, trainerContext(b), async (client) => {
      const tampered = await client.query("update leads set full_name = 'x' where id = $1", [
        leadA,
      ]);
      expect(tampered.rowCount).toBe(0);
    });
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        (
          await client.query(
            "update leads set stage = 'lost', lost_reason = 'price', source = 'referral' where id = $1",
            [leadA],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        await sqlStateIn(
          client,
          "update leads set stage = 'converted', lost_reason = null where id = $1",
          [leadA],
        ),
      ).toBe("42501");
      for (const column of ["workspace_id = $2", "created_via = 'public_page'", "utm = '{}'"]) {
        expect(
          await sqlStateIn(
            client,
            `update leads set ${column} where id = $1`,
            column.includes("$2") ? [leadA, b.workspaceId] : [leadA],
          ),
        ).toBe("42501");
      }
      // Lost details only exist on lost leads.
      expect(
        await sqlStateIn(client, "update leads set stage = 'new' where id = $1", [leadA]),
      ).toBe("23514");
    });
  });

  it("lets a trainer add timeline entries only for their own leads and signed as themselves", async () => {
    const insertActivity = `insert into lead_activities (workspace_id, lead_id, type, data, actor_kind, actor_user_id)
      values ($1, $2, $3, $4, $5, $6)`;
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertActivity, [
          a.workspaceId,
          leadA,
          "note",
          { body: "Prefers mornings" },
          "trainer",
          a.userId,
        ]),
      ).toBeUndefined();
      expect(
        await sqlStateIn(client, insertActivity, [
          a.workspaceId,
          leadA,
          "note",
          { body: "x" },
          "system",
          null,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertActivity, [
          a.workspaceId,
          leadA,
          "enquiry_received",
          {},
          "trainer",
          a.userId,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertActivity, [
          a.workspaceId,
          leadA,
          "note",
          { body: "" },
          "trainer",
          a.userId,
        ]),
      ).toBe("23514");
      expect(await sqlStateIn(client, "update lead_activities set data = '{}'")).toBe("42501");
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        await sqlStateIn(client, insertActivity, [
          a.workspaceId,
          leadA,
          "note",
          { body: "hijack" },
          "trainer",
          b.userId,
        ]),
      ).toBe("42501");
    });
  });

  it("deletes only within the trainer's own workspace", async () => {
    await withContext(app, trainerContext(b), async (client) => {
      expect((await client.query("delete from leads where id = $1", [leadA])).rowCount).toBe(0);
    });
    await withContext(app, trainerContext(a), async (client) => {
      expect((await client.query("delete from leads where id = $1", [leadA])).rowCount).toBe(1);
    });
  });

  it("keeps a suspended workspace's leads read-only", async () => {
    await owner.query("update workspaces set status = 'suspended' where id = $1", [b.workspaceId]);
    try {
      await withContext(app, trainerContext(b), async (client) => {
        expect(
          await sqlStateIn(client, insertLead, [b.workspaceId, "manual", b.userId, "new"]),
        ).toBe("42501");
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [b.workspaceId]);
    }
  });
});
