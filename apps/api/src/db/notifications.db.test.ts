import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertNotice = `insert into notifications (workspace_id, recipient_user_id, type, title, dedupe_key)
  values ($1, $2, $3, 'Hello', $4)`;

describe("notifications and job runs (step 5.2)", () => {
  let owner: Pool;
  let app: Pool;
  let system: Pool;
  let a: Trainer;
  let b: Trainer;
  let clientUser: string;
  let strangerUser: string;
  let asha: string;

  const portal = () => ({
    userId: clientUser,
    workspaceId: a.workspaceId,
    clientId: asha,
    actor: "client" as const,
  });

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    const users = await owner.query<{ id: string }>(
      "insert into users (email) values (null), (null) returning id",
    );
    clientUser = users.rows[0]?.id ?? "";
    strangerUser = users.rows[1]?.id ?? "";
    asha = await committed(app, trainerContext(a), async (client) => {
      const created = await client.query<{ id: string }>(
        `insert into clients (workspace_id, full_name, phone_e164, status, created_by_user_id, onboarded_at)
         values ($1, 'Asha Rao', '+919888800001', 'active', $2, now()) returning id`,
        [a.workspaceId, a.userId],
      );
      return created.rows[0]?.id ?? "";
    });
    await owner.query("update clients set user_id = $1 where id = $2", [clientUser, asha]);
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end(), system.end()]);
  });

  it("keeps one notification per recipient and dedupe key", async () => {
    await system.query(insertNotice, [a.workspaceId, a.userId, "follow_up_due", "follow_up:x"]);
    expect(
      await sqlState(
        system.query(insertNotice, [a.workspaceId, a.userId, "follow_up_due", "follow_up:x"]),
      ),
    ).toBe("23505");
    const again = await system.query(
      `${insertNotice} on conflict (recipient_user_id, dedupe_key) do nothing`,
      [a.workspaceId, a.userId, "follow_up_due", "follow_up:x"],
    );
    expect(again.rowCount).toBe(0);
  });

  it("lets a trainer notify only their own app clients, about their program or sessions", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertNotice, [
          a.workspaceId,
          clientUser,
          "session_booked",
          "s:1",
        ]),
      ).toBeUndefined();
      expect(
        await sqlStateIn(client, insertNotice, [a.workspaceId, clientUser, "new_lead", "s:2"]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertNotice, [
          a.workspaceId,
          strangerUser,
          "session_booked",
          "s:3",
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertNotice, [a.workspaceId, a.userId, "payment_due", "s:4"]),
      ).toBe("42501");
      expect(await sqlStateIn(client, "delete from notifications")).toBe("42501");
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        await sqlStateIn(client, insertNotice, [
          b.workspaceId,
          clientUser,
          "session_booked",
          "s:5",
        ]),
      ).toBe("42501");
      expect((await client.query("select 1 from notifications")).rowCount).toBe(0);
    });
  });

  it("lets a client read their own notices and tell only their trainer about a check-in", async () => {
    await system.query(insertNotice, [a.workspaceId, clientUser, "program_assigned", "p:1"]);
    await withContext(app, portal(), async (client) => {
      const mine = await client.query<{ recipient_user_id: string }>(
        "select recipient_user_id from notifications",
      );
      expect(new Set(mine.rows.map((row) => row.recipient_user_id))).toEqual(new Set([clientUser]));
      expect(
        (await client.query("update notifications set read_at = now() where dedupe_key = 'p:1'"))
          .rowCount,
      ).toBe(1);
      expect(
        await sqlStateIn(client, insertNotice, [
          a.workspaceId,
          a.userId,
          "check_in_submitted",
          "c:1",
        ]),
      ).toBeUndefined();
      expect(
        await sqlStateIn(client, insertNotice, [
          a.workspaceId,
          b.userId,
          "check_in_submitted",
          "c:2",
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertNotice, [a.workspaceId, a.userId, "payment_due", "c:3"]),
      ).toBe("42501");
    });
    await withContext(app, trainerContext(a), async (client) => {
      // The trainer doesn't see the client's notices.
      expect(
        (
          await client.query("select 1 from notifications where recipient_user_id = $1", [
            clientUser,
          ])
        ).rowCount,
      ).toBe(0);
    });
  });

  it("keeps job runs to the job runner", async () => {
    await system.query(
      "insert into job_runs (name, status, started_at, summary) values ('test.job', 'succeeded', now(), '{}')",
    );
    expect(await sqlState(system.query("update job_runs set status = 'failed'"))).toBe("42501");
    await withContext(app, trainerContext(a), async (client) => {
      expect(await sqlStateIn(client, "select 1 from job_runs")).toBe("42501");
      expect(
        await sqlStateIn(
          client,
          "insert into job_runs (name, status, started_at) values ('x', 'succeeded', now())",
        ),
      ).toBe("42501");
    });
  });
});
