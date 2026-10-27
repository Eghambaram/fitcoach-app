import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertClient = `insert into clients (workspace_id, full_name, phone_e164, status, created_by_user_id, onboarded_at)
  values ($1, $2, $3, 'active', $4, now()) returning id`;
const insertInvite = `insert into client_invites (workspace_id, client_id, token_hash, channel, expires_at, created_by_user_id)
  values ($1, $2, $3, 'whatsapp', now() + interval '7 days', $4) returning id`;
const insertNote = `insert into client_notes (workspace_id, client_id, body, author_user_id) values ($1, $2, 'Private', $3)`;
const insertClientSession = `insert into sessions (token_hash, user_id, actor, workspace_id, client_id, expires_at)
  values ($1, $2, $3, $4, $5, now() + interval '60 days')`;

let tokens = 0;
const token = () => `hash-${Date.now()}-${tokens++}`;

describe("client portal access (step 4.1)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let asha: string;
  let ravi: string;
  let bClient: string;
  let clientUser: string;

  /** The context a client's portal request runs with. */
  const portal = (clientId: string, workspaceId = a.workspaceId) => ({
    userId: clientUser,
    workspaceId,
    clientId,
    actor: "client" as const,
  });

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    [asha, ravi] = await committed(app, trainerContext(a), async (client) => {
      const first = await client.query<{ id: string }>(insertClient, [
        a.workspaceId,
        "Asha Rao",
        "+919844400001",
        a.userId,
      ]);
      const second = await client.query<{ id: string }>(insertClient, [
        a.workspaceId,
        "Ravi K",
        "+919844400002",
        a.userId,
      ]);
      await client.query(insertNote, [a.workspaceId, first.rows[0]?.id, a.userId]);
      return [first.rows[0]?.id ?? "", second.rows[0]?.id ?? ""];
    });
    bClient = await committed(app, trainerContext(b), async (client) => {
      const created = await client.query<{ id: string }>(insertClient, [
        b.workspaceId,
        "Meera S",
        "+919844400003",
        b.userId,
      ]);
      return created.rows[0]?.id ?? "";
    });
    const user = await owner.query<{ id: string }>(
      "insert into users (email) values (null) returning id",
    );
    clientUser = user.rows[0]?.id ?? "";
    await owner.query(
      "insert into profiles (user_id, kind, display_name) values ($1, 'client', 'Asha Rao')",
      [clientUser],
    );
    await owner.query("update clients set user_id = $1 where id = $2", [clientUser, asha]);
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("lets the trainer create and revoke their own clients' links, and nothing else", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const invite = await client.query<{ id: string }>(insertInvite, [
        a.workspaceId,
        asha,
        token(),
        a.userId,
      ]);
      const id = invite.rows[0]?.id;
      // Signed by the trainer, and open when created.
      expect(await sqlStateIn(client, insertInvite, [a.workspaceId, asha, token(), b.userId])).toBe(
        "42501",
      );
      expect(
        await sqlStateIn(
          client,
          `insert into client_invites (workspace_id, client_id, token_hash, channel, expires_at, consumed_at, created_by_user_id)
           values ($1, $2, $3, 'email', now() + interval '1 day', now(), $4)`,
          [a.workspaceId, asha, token(), a.userId],
        ),
      ).toBe("42501");
      expect(
        await sqlStateIn(
          client,
          "update client_invites set expires_at = now() + interval '1 year'",
        ),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, "update client_invites set consumed_at = now() where id = $1", [
          id,
        ]),
      ).toBe("42501");
      expect(
        (await client.query("update client_invites set revoked_at = now() where id = $1", [id]))
          .rowCount,
      ).toBe(1);
      // Revoked is final.
      expect(
        (await client.query("update client_invites set revoked_at = null where id = $1", [id]))
          .rowCount,
      ).toBe(0);
      expect(await sqlStateIn(client, "delete from client_invites")).toBe("42501");
      expect(
        (await client.query("update clients set portal_revoked_at = now() where id = $1", [asha]))
          .rowCount,
      ).toBe(1);
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(await sqlStateIn(client, insertInvite, [b.workspaceId, asha, token(), b.userId])).toBe(
        "23503",
      );
      expect(await sqlStateIn(client, insertInvite, [a.workspaceId, asha, token(), b.userId])).toBe(
        "42501",
      );
    });
    await committed(app, trainerContext(a), (client) =>
      client.query(insertInvite, [a.workspaceId, ravi, token(), a.userId]),
    );
    await withContext(app, trainerContext(b), async (client) => {
      expect((await client.query("select 1 from client_invites")).rowCount).toBe(0);
    });
    await withContext(app, {}, async (client) => {
      expect((await client.query("select 1 from client_invites")).rowCount).toBe(0);
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(await sqlState(system.query("delete from client_invites"))).toBe("42501");
    } finally {
      await system.end();
    }
  });

  it("shows a client only their own client row, workspace and trainer", async () => {
    await withContext(app, portal(asha), async (client) => {
      const own = await client.query<{ id: string }>("select id from clients");
      expect(own.rows.map((row) => row.id)).toEqual([asha]);
      const workspaces = await client.query<{ id: string }>("select id from workspaces");
      expect(workspaces.rows.map((row) => row.id)).toEqual([a.workspaceId]);
      const trainers = await client.query<{ user_id: string }>(
        "select user_id from profiles where kind = 'trainer'",
      );
      expect(trainers.rows.map((row) => row.user_id)).toEqual([a.userId]);
      // Everything trainer-only stays out of reach.
      for (const table of [
        "leads",
        "client_notes",
        "client_invites",
        "client_packages",
        "client_payments",
        "appointments",
        "workout_sessions",
        "trainer_settings",
        "message_templates",
      ]) {
        const rows = await client.query(`select 1 from ${table} where workspace_id = $1`, [
          a.workspaceId,
        ]);
        expect(rows.rowCount, table).toBe(0);
      }
      expect((await client.query("update clients set full_name = 'x'")).rowCount).toBe(0);
      expect(await sqlStateIn(client, insertNote, [a.workspaceId, asha, clientUser])).toBe("42501");
      expect(
        await sqlStateIn(client, insertInvite, [a.workspaceId, asha, token(), clientUser]),
      ).toBe("42501");
    });
    // A forged client id from another workspace (or a client context without the client actor).
    await withContext(app, portal(bClient), async (client) => {
      expect((await client.query("select 1 from clients")).rowCount).toBe(0);
    });
    await withContext(app, portal(bClient, b.workspaceId), async (client) => {
      expect((await client.query("select id from clients where id = $1", [asha])).rowCount).toBe(0);
    });
    // The client id alone grants nothing without the client actor.
    await withContext(
      app,
      { userId: clientUser, workspaceId: a.workspaceId, clientId: asha },
      async (client) => {
        expect((await client.query("select 1 from clients")).rowCount).toBe(0);
        expect((await client.query("select 1 from workspaces")).rowCount).toBe(0);
      },
    );
  });

  it("ties a client session to one client of the same workspace", async () => {
    expect(
      await sqlState(
        owner.query(insertClientSession, [token(), clientUser, "client", a.workspaceId, null]),
      ),
    ).toBe("23514");
    expect(
      await sqlState(
        owner.query(insertClientSession, [token(), a.userId, "trainer", a.workspaceId, asha]),
      ),
    ).toBe("23514");
    expect(
      await sqlState(
        owner.query(insertClientSession, [token(), clientUser, "client", b.workspaceId, asha]),
      ),
    ).toBe("23503");
    expect(
      await sqlState(
        owner.query(insertClientSession, [token(), clientUser, "client", a.workspaceId, asha]),
      ),
    ).toBeUndefined();
  });
});
