import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const SYSTEM = { actor: "system" as const };

describe("public page, enquiry form, leads and notifications RLS", () => {
  let owner: Pool;
  let app: Pool;
  let system: Pool;
  let a: Trainer;
  let b: Trainer;
  let formA: string;
  let formB: string;
  let leadA: string;
  let notificationA: string;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));

    const forms = await owner.query<{ workspace_id: string; id: string }>(
      "select workspace_id, id from lead_forms where workspace_id = any($1) and version = 1",
      [[a.workspaceId, b.workspaceId]],
    );
    formA = forms.rows.find((row) => row.workspace_id === a.workspaceId)?.id ?? "";
    formB = forms.rows.find((row) => row.workspace_id === b.workspaceId)?.id ?? "";

    // What the public enquiry service writes, as fitcoach_system.
    await committed(system, SYSTEM, async (client) => {
      const lead = await client.query<{ id: string }>(
        `insert into leads (workspace_id, full_name, phone_e164, goal, source, created_via)
         values ($1, 'Ravi K', '+919876543210', 'get_stronger', 'instagram', 'public_page') returning id`,
        [a.workspaceId],
      );
      leadA = lead.rows[0]?.id ?? "";
      await client.query(
        `insert into lead_activities (workspace_id, lead_id, type, actor_kind) values ($1, $2, 'enquiry_received', 'system')`,
        [a.workspaceId, leadA],
      );
      await client.query(
        `insert into lead_consents (workspace_id, lead_id, lead_form_id, ip_hash) values ($1, $2, $3, 'hash')`,
        [a.workspaceId, leadA, formA],
      );
      const notification = await client.query<{ id: string }>(
        `insert into notifications (workspace_id, recipient_user_id, type, title, link)
         values ($1, $2, 'new_lead', 'New enquiry', $3) returning id`,
        [a.workspaceId, a.userId, `/app/leads/${leadA}`],
      );
      notificationA = notification.rows[0]?.id ?? "";
    });
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end(), system.end()]);
  });

  const count = (pool: Pool, context: object, query: string, params: unknown[] = []) =>
    withContext(pool, context, async (client) => (await client.query(query, params)).rowCount);

  it("gives every new workspace an unpublished page and enquiry form v1", async () => {
    const { rows } = await owner.query<{ is_published: boolean; version: number }>(
      `select p.is_published, f.version from trainer_public_pages p
       join lead_forms f on f.workspace_id = p.workspace_id where p.workspace_id = $1`,
      [a.workspaceId],
    );
    expect(rows).toEqual([{ is_published: false, version: 1 }]);
  });

  it("lets a trainer edit only their own page, and only the content columns", async () => {
    expect({
      own: await count(app, trainerContext(a), "select 1 from trainer_public_pages"),
      other: await count(
        app,
        trainerContext(b),
        "select 1 from trainer_public_pages where workspace_id = $1",
        [a.workspaceId],
      ),
      empty: await count(app, {}, "select 1 from trainer_public_pages"),
    }).toEqual({ own: 1, other: 0, empty: 0 });

    await withContext(app, trainerContext(b), async (client) => {
      const tampered = await client.query(
        "update trainer_public_pages set headline = 'hijacked' where workspace_id = $1",
        [a.workspaceId],
      );
      expect(tampered.rowCount).toBe(0);
      expect(
        (
          await client.query(
            "update trainer_public_pages set headline = 'Strength coach', is_published = true, published_at = now() where workspace_id = $1",
            [b.workspaceId],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        await sqlStateIn(
          client,
          "update trainer_public_pages set workspace_id = $1 where workspace_id = $2",
          [a.workspaceId, b.workspaceId],
        ),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, "delete from trainer_public_pages where workspace_id = $1", [
          b.workspaceId,
        ]),
      ).toBe("42501");
    });
  });

  it("keeps a suspended workspace's page read-only", async () => {
    await owner.query("update workspaces set status = 'suspended' where id = $1", [b.workspaceId]);
    try {
      await withContext(app, trainerContext(b), async (client) => {
        const updated = await client.query(
          "update trainer_public_pages set headline = 'x' where workspace_id = $1",
          [b.workspaceId],
        );
        expect(updated.rowCount).toBe(0);
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [b.workspaceId]);
    }
  });

  it("only adds new form versions — never edits or deletes one consents point at", async () => {
    const insertForm = `insert into lead_forms (workspace_id, version, consent_text, fields, created_by_user_id)
      values ($1, 2, 'A consent text long enough to pass.', '{}', $2)`;
    await withContext(app, trainerContext(b), async (client) => {
      expect(await sqlStateIn(client, insertForm, [b.workspaceId, b.userId])).toBeUndefined();
      expect(await sqlStateIn(client, insertForm, [a.workspaceId, b.userId])).toBe("42501");
      expect(await sqlStateIn(client, insertForm, [b.workspaceId, a.userId])).toBe("42501");
      expect(
        await sqlStateIn(
          client,
          "update lead_forms set consent_text = 'changed text here ok' where id = $1",
          [formB],
        ),
      ).toBe("42501");
      expect(await sqlStateIn(client, "delete from lead_forms where id = $1", [formB])).toBe(
        "42501",
      );
    });
    await withContext(system, SYSTEM, async (client) => {
      expect(await sqlStateIn(client, "delete from lead_forms where id = $1", [formA])).toBe(
        "42501",
      );
    });
  });

  it("shows leads, their timeline and consents only to the owning trainer", async () => {
    for (const table of ["leads", "lead_activities", "lead_consents"]) {
      expect({
        table,
        own: await count(app, trainerContext(a), `select 1 from ${table}`),
        other: await count(app, trainerContext(b), `select 1 from ${table}`),
        empty: await count(app, {}, `select 1 from ${table}`),
        client: await count(
          app,
          { userId: a.userId, workspaceId: a.workspaceId, actor: "client" },
          `select 1 from ${table}`,
        ),
      }).toEqual({ table, own: 1, other: 0, empty: 0, client: 0 });
    }
  });

  it("lets nobody rewrite lead history, and the app no lead writes yet", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(
          client,
          `insert into leads (workspace_id, full_name, phone_e164, goal, source, created_via)
           values ($1, 'X', '+919876543211', 'other', 'other', 'manual')`,
          [a.workspaceId],
        ),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, "update leads set stage = 'converted' where id = $1", [leadA]),
      ).toBe("42501");
      expect(await sqlStateIn(client, "delete from leads where id = $1", [leadA])).toBe("42501");
      expect(await sqlStateIn(client, "delete from lead_consents")).toBe("42501");
      expect(await sqlStateIn(client, "update lead_activities set type = 'stage_changed'")).toBe(
        "42501",
      );
    });
    await withContext(system, SYSTEM, async (client) => {
      expect(await sqlStateIn(client, "update lead_activities set data = '{}'")).toBe("42501");
      expect(await sqlStateIn(client, "delete from lead_consents")).toBe("42501");
      expect(await sqlStateIn(client, "delete from leads where id = $1", [leadA])).toBe("42501");
    });
  });

  it("refuses children that point across tenants (composite foreign keys)", async () => {
    await withContext(system, SYSTEM, async (client) => {
      // A's lead with B's consent form — the kind of mix-up a buggy service could make.
      expect(
        await sqlStateIn(
          client,
          "insert into lead_consents (workspace_id, lead_id, lead_form_id) values ($1, $2, $3)",
          [a.workspaceId, leadA, formB],
        ),
      ).toBe("23503");
      expect(
        await sqlStateIn(
          client,
          "insert into lead_activities (workspace_id, lead_id, type, actor_kind) values ($1, $2, 'enquiry_received', 'system')",
          [b.workspaceId, leadA],
        ),
      ).toBe("23503");
    });
  });

  it("shows notifications only to their recipient, who may only mark them read", async () => {
    expect({
      own: await count(app, trainerContext(a), "select 1 from notifications"),
      other: await count(app, trainerContext(b), "select 1 from notifications"),
      empty: await count(app, {}, "select 1 from notifications"),
    }).toEqual({ own: 1, other: 0, empty: 0 });

    await withContext(app, trainerContext(b), async (client) => {
      const tampered = await client.query(
        "update notifications set read_at = now() where id = $1",
        [notificationA],
      );
      expect(tampered.rowCount).toBe(0);
    });
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        (
          await client.query("update notifications set read_at = now() where id = $1", [
            notificationA,
          ])
        ).rowCount,
      ).toBe(1);
      expect(
        await sqlStateIn(client, "update notifications set title = 'x' where id = $1", [
          notificationA,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(
          client,
          "insert into notifications (workspace_id, recipient_user_id, type, title) values ($1, $2, 'new_lead', 'x')",
          [a.workspaceId, a.userId],
        ),
      ).toBe("42501");
    });
  });
});
