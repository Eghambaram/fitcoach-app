import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertLead = `
  insert into leads (workspace_id, full_name, phone_e164, goal, source, created_via, created_by_user_id)
  values ($1, $2, '+919812345678', 'lose_weight', 'walk_in', 'manual', $3)
  returning id`;
const insertFollowUp = `
  insert into lead_follow_ups (workspace_id, lead_id, action_type, due_at, created_by_user_id, status, completed_at, outcome)
  values ($1, $2, 'call', $3, $4, $5, $6, $7)
  returning id`;
const insertContact = `
  insert into communication_logs (workspace_id, lead_id, follow_up_id, channel, outcome, actor_user_id)
  values ($1, $2, $3, 'whatsapp', 'message_sent', $4)`;

describe("follow-ups and communication log (step 2.3)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let leadA: string;
  let otherLeadA: string;
  let leadB: string;

  async function leadColumns(id: string) {
    const { rows } = await owner.query<{
      next_follow_up_at: Date | null;
      last_contact_at: Date | null;
    }>("select next_follow_up_at, last_contact_at from leads where id = $1", [id]);
    return rows[0];
  }

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    const lead = (trainer: Trainer, name: string) =>
      committed(app, trainerContext(trainer), async (client) => {
        const { rows } = await client.query<{ id: string }>(insertLead, [
          trainer.workspaceId,
          name,
          trainer.userId,
        ]);
        return rows[0]?.id ?? "";
      });
    leadA = await lead(a, "Meena S");
    otherLeadA = await lead(a, "Ravi K");
    leadB = await lead(b, "Asha R");
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("keeps next_follow_up_at on the earliest open follow-up", async () => {
    const soon = new Date(Date.now() + 86_400_000);
    const later = new Date(Date.now() + 3 * 86_400_000);
    const [first] = await committed(app, trainerContext(a), async (client) => {
      const ids: string[] = [];
      for (const due of [later, soon]) {
        const { rows } = await client.query<{ id: string }>(insertFollowUp, [
          a.workspaceId,
          leadA,
          due,
          a.userId,
          "open",
          null,
          null,
        ]);
        ids.push(rows[0]?.id ?? "");
      }
      return [ids[1] ?? ""];
    });
    expect((await leadColumns(leadA))?.next_follow_up_at?.getTime()).toBe(soon.getTime());

    await committed(app, trainerContext(a), (client) =>
      client.query(
        "update lead_follow_ups set status = 'done', outcome = 'spoke', completed_at = now(), completed_by_user_id = $2 where id = $1",
        [first, a.userId],
      ),
    );
    expect((await leadColumns(leadA))?.next_follow_up_at?.getTime()).toBe(later.getTime());
  });

  it("refuses follow-ups in another workspace, signed as someone else, or already finished", async () => {
    const due = new Date(Date.now() + 86_400_000);
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        await sqlStateIn(client, insertFollowUp, [
          a.workspaceId,
          leadA,
          due,
          b.userId,
          "open",
          null,
          null,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertFollowUp, [
          b.workspaceId,
          leadB,
          due,
          a.userId,
          "open",
          null,
          null,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertFollowUp, [
          b.workspaceId,
          leadB,
          due,
          b.userId,
          "done",
          new Date(),
          "spoke",
        ]),
      ).toBe("42501");
      // A lead id from another tenant can't be smuggled under the caller's workspace.
      expect(
        await sqlStateIn(client, insertFollowUp, [
          b.workspaceId,
          leadA,
          due,
          b.userId,
          "open",
          null,
          null,
        ]),
      ).toBe("23503");
      // Nothing of A's is visible, and nothing can be touched.
      expect(
        (
          await client.query("select 1 from lead_follow_ups where workspace_id = $1", [
            a.workspaceId,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await client.query("update lead_follow_ups set notes = 'x' where workspace_id = $1", [
            a.workspaceId,
          ])
        ).rowCount,
      ).toBe(0);
    });
  });

  it("makes finished follow-ups final, and never deletes them", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const finished = await client.query(
        "update lead_follow_ups set notes = 'rewrite' where lead_id = $1 and status <> 'open'",
        [leadA],
      );
      expect(finished.rowCount).toBe(0);
      expect(
        await sqlStateIn(client, "delete from lead_follow_ups where lead_id = $1", [leadA]),
      ).toBe("42501");
      // Done needs an outcome and a completion time.
      expect(
        await sqlStateIn(
          client,
          "update lead_follow_ups set status = 'done', completed_at = now() where lead_id = $1 and status = 'open'",
          [leadA],
        ),
      ).toBe("23514");
      // Only the editable columns can change.
      expect(
        await sqlStateIn(client, "update lead_follow_ups set lead_id = $2 where lead_id = $1", [
          leadA,
          otherLeadA,
        ]),
      ).toBe("42501");
    });
  });

  it("keeps the communication log append-only and maintains last_contact_at", async () => {
    await committed(app, trainerContext(a), (client) =>
      client.query(insertContact, [a.workspaceId, leadA, null, a.userId]),
    );
    expect((await leadColumns(leadA))?.last_contact_at).toBeInstanceOf(Date);

    await withContext(app, trainerContext(a), async (client) => {
      expect(await sqlStateIn(client, "update communication_logs set note = 'x'")).toBe("42501");
      expect(await sqlStateIn(client, "delete from communication_logs")).toBe("42501");
      // Signed as the trainer themselves.
      expect(await sqlStateIn(client, insertContact, [a.workspaceId, leadA, null, b.userId])).toBe(
        "42501",
      );
      // A follow-up of a different lead can't be attached.
      const { rows } = await client.query<{ id: string }>(
        "select id from lead_follow_ups where lead_id = $1 limit 1",
        [leadA],
      );
      expect(
        await sqlStateIn(client, insertContact, [a.workspaceId, otherLeadA, rows[0]?.id, a.userId]),
      ).toBe("23503");
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        (await client.query("select 1 from communication_logs where lead_id = $1", [leadA]))
          .rowCount,
      ).toBe(0);
      expect(await sqlStateIn(client, insertContact, [a.workspaceId, leadA, null, b.userId])).toBe(
        "42501",
      );
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(await sqlState(system.query("update communication_logs set note = 'x'"))).toBe(
        "42501",
      );
      expect(await sqlState(system.query("delete from lead_follow_ups"))).toBe("42501");
    } finally {
      await system.end();
    }
  });

  it("shows nothing to an empty context or a client context", async () => {
    await withContext(app, {}, async (client) => {
      expect((await client.query("select 1 from lead_follow_ups")).rowCount).toBe(0);
      expect((await client.query("select 1 from communication_logs")).rowCount).toBe(0);
    });
    await withContext(
      app,
      { userId: a.userId, workspaceId: a.workspaceId, actor: "client" },
      async (client) => {
        expect((await client.query("select 1 from lead_follow_ups")).rowCount).toBe(0);
        expect((await client.query("select 1 from communication_logs")).rowCount).toBe(0);
      },
    );
  });

  it("keeps a suspended workspace's follow-ups and contacts read-only", async () => {
    await owner.query("update workspaces set status = 'suspended' where id = $1", [b.workspaceId]);
    try {
      await withContext(app, trainerContext(b), async (client) => {
        expect(
          await sqlStateIn(client, insertFollowUp, [
            b.workspaceId,
            leadB,
            new Date(Date.now() + 86_400_000),
            b.userId,
            "open",
            null,
            null,
          ]),
        ).toBe("42501");
        expect(
          await sqlStateIn(client, insertContact, [b.workspaceId, leadB, null, b.userId]),
        ).toBe("42501");
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [b.workspaceId]);
    }
  });
});
