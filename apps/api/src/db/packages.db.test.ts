import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertClient = `insert into clients (workspace_id, full_name, phone_e164, status, created_by_user_id, onboarded_at)
  values ($1, 'Asha R', $2, 'active', $3, now()) returning id`;
const insertPackage = `insert into client_packages (workspace_id, client_id, name, kind, sessions_included,
  starts_on, price_paise, amount_due_paise, created_by_user_id)
  values ($1, $2, '12 sessions', 'session_pack', 12, '2031-01-01', 1200000, 1000000, $3) returning id`;
const insertAppointment = `insert into appointments (workspace_id, client_id, kind, starts_at, duration_min, ends_at,
  timezone, status, created_by_user_id)
  values ($1, $2, 'session', '2031-01-06T07:00:00Z', 60, '2031-01-06T08:00:00Z', 'Asia/Kolkata', 'scheduled', $3)
  returning id`;
const insertMark = `insert into package_session_ledger (workspace_id, package_id, appointment_id, reason,
  sessions_used, mark_no, actor_user_id) values ($1, $2, $3, 'attended', 1, $4, $5) returning id`;
const insertPayment = `insert into client_payments (workspace_id, package_id, amount_paise, method, paid_on,
  recorded_by_user_id) values ($1, $2, $3, 'upi', '2031-01-02', $4) returning id`;

describe("packages, session ledger and payments (step 3.2)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let clientA: string;
  let packageA: string;
  let appointmentA: string;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    [clientA, packageA, appointmentA] = await committed(app, trainerContext(a), async (client) => {
      const created = await client.query<{ id: string }>(insertClient, [
        a.workspaceId,
        "+919822200001",
        a.userId,
      ]);
      const clientId = created.rows[0]?.id ?? "";
      const pkg = await client.query<{ id: string }>(insertPackage, [
        a.workspaceId,
        clientId,
        a.userId,
      ]);
      const appointment = await client.query<{ id: string }>(insertAppointment, [
        a.workspaceId,
        clientId,
        a.userId,
      ]);
      return [clientId, pkg.rows[0]?.id ?? "", appointment.rows[0]?.id ?? ""];
    });
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("allows one active package per client and keeps what was sold unchangeable", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(await sqlStateIn(client, insertPackage, [a.workspaceId, clientA, a.userId])).toBe(
        "23505",
      );
      // Only closing columns may change…
      expect(
        await sqlStateIn(client, "update client_packages set price_paise = 1 where id = $1", [
          packageA,
        ]),
      ).toBe("42501");
      // …and closing needs closed_at with it.
      expect(
        await sqlStateIn(client, "update client_packages set status = 'completed' where id = $1", [
          packageA,
        ]),
      ).toBe("23514");
      expect(
        (
          await client.query(
            "update client_packages set status = 'completed', closed_at = now(), closed_reason = 'Renewed' where id = $1",
            [packageA],
          )
        ).rowCount,
      ).toBe(1);
      // A closed package is final, and a renewal can now be inserted.
      expect(
        (
          await client.query(
            "update client_packages set status = 'active', closed_at = null where id = $1",
            [packageA],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        await sqlStateIn(client, insertPackage, [a.workspaceId, clientA, a.userId]),
      ).toBeUndefined();
      expect(await sqlStateIn(client, "delete from client_packages")).toBe("42501");
    });
  });

  it("checks package shape and money", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const sell = (columns: string, values: string) =>
        sqlStateIn(
          client,
          `insert into client_packages (workspace_id, client_id, starts_on, created_by_user_id, ${columns})
           values ($1, $2, '2031-01-01', $3, ${values})`,
          [a.workspaceId, clientA, a.userId],
        );
      // A session pack needs sessions; the amount due can't exceed the price; no negative money.
      expect(
        await sell("name, kind, price_paise, amount_due_paise", "'x', 'session_pack', 100, 100"),
      ).toBe("23514");
      expect(
        await sell(
          "name, kind, sessions_included, price_paise, amount_due_paise",
          "'x', 'session_pack', 4, 100, 200",
        ),
      ).toBe("23514");
      expect(
        await sell("name, kind, price_paise, amount_due_paise", "'x', 'time_based', -1, 0"),
      ).toBe("23514");
      expect(
        await sell(
          "name, kind, price_paise, amount_due_paise, expires_on",
          "'x', 'time_based', 0, 0, '2030-12-31'",
        ),
      ).toBe("23514");
      expect(
        await sell(
          "name, kind, price_paise, amount_due_paise, status",
          "'x', 'time_based', 0, 0, 'completed'",
        ),
      ).toBe("42501");
    });
  });

  it("makes the ledger append-only and a mark count once per (package, appointment, mark)", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const { rows } = await client.query<{ id: string }>(
        "select id from client_packages where client_id = $1 and status = 'active'",
        [clientA],
      );
      const pkg = rows[0]?.id ?? "";
      const first = await client.query<{ id: string }>(insertMark, [
        a.workspaceId,
        pkg,
        appointmentA,
        1,
        a.userId,
      ]);
      // A second mark with the same number (a double submit) is refused.
      expect(
        await sqlStateIn(client, insertMark, [a.workspaceId, pkg, appointmentA, 1, a.userId]),
      ).toBe("23505");
      // Un-marking is a reversal row; a row can be reversed only once.
      const reverse = `insert into package_session_ledger (workspace_id, package_id, appointment_id, reason,
        sessions_used, reverses_id, actor_user_id) values ($1, $2, $3, 'attended', -1, $4, $5)`;
      const firstId = first.rows[0]?.id ?? "";
      expect(
        await sqlStateIn(client, reverse, [a.workspaceId, pkg, appointmentA, firstId, a.userId]),
      ).toBeUndefined();
      expect(
        await sqlStateIn(client, reverse, [a.workspaceId, pkg, appointmentA, firstId, a.userId]),
      ).toBe("23505");
      // Marking again after the undo is mark 2.
      expect(
        await sqlStateIn(client, insertMark, [a.workspaceId, pkg, appointmentA, 2, a.userId]),
      ).toBeUndefined();
      const sum = await client.query<{ total: number }>(
        "select sum(sessions_used)::int as total from package_session_ledger where package_id = $1",
        [pkg],
      );
      expect(sum.rows[0]?.total).toBe(1);

      // Manual adjustments need a note; marks can't use more than one session.
      const adjust = `insert into package_session_ledger (workspace_id, package_id, reason, sessions_used, note,
        actor_user_id) values ($1, $2, 'manual_adjustment', $3, $4, $5)`;
      expect(await sqlStateIn(client, adjust, [a.workspaceId, pkg, -1, null, a.userId])).toBe(
        "23514",
      );
      expect(
        await sqlStateIn(client, adjust, [a.workspaceId, pkg, -1, "Gave one back", a.userId]),
      ).toBeUndefined();
      expect(
        await sqlStateIn(
          client,
          `insert into package_session_ledger (workspace_id, package_id, appointment_id, reason, sessions_used,
            mark_no, actor_user_id) values ($1, $2, $3, 'attended', 2, 3, $4)`,
          [a.workspaceId, pkg, appointmentA, a.userId],
        ),
      ).toBe("23514");
      // Signed as the trainer; never updated or deleted.
      expect(
        await sqlStateIn(client, insertMark, [a.workspaceId, pkg, appointmentA, 9, b.userId]),
      ).toBe("42501");
      expect(await sqlStateIn(client, "update package_session_ledger set sessions_used = 0")).toBe(
        "42501",
      );
      expect(await sqlStateIn(client, "delete from package_session_ledger")).toBe("42501");
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(
        await sqlState(system.query("update package_session_ledger set sessions_used = 0")),
      ).toBe("42501");
      expect(await sqlState(system.query("delete from package_session_ledger"))).toBe("42501");
    } finally {
      await system.end();
    }
  });

  it("makes payments append-only, with voids as rows that carry a reason", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const payment = await client.query<{ id: string }>(insertPayment, [
        a.workspaceId,
        packageA,
        500000,
        a.userId,
      ]);
      const paymentId = payment.rows[0]?.id ?? "";
      expect(await sqlStateIn(client, insertPayment, [a.workspaceId, packageA, 0, a.userId])).toBe(
        "23514",
      );
      const voiding = `insert into client_payments (workspace_id, package_id, amount_paise, method, paid_on,
        voids_id, void_reason, recorded_by_user_id) values ($1, $2, 500000, 'upi', '2031-01-02', $3, $4, $5)`;
      expect(
        await sqlStateIn(client, voiding, [a.workspaceId, packageA, paymentId, null, a.userId]),
      ).toBe("23514");
      expect(
        await sqlStateIn(client, voiding, [a.workspaceId, packageA, paymentId, "Typo", a.userId]),
      ).toBeUndefined();
      expect(
        await sqlStateIn(client, voiding, [a.workspaceId, packageA, paymentId, "Again", a.userId]),
      ).toBe("23505");
      expect(
        await sqlStateIn(client, insertPayment, [a.workspaceId, packageA, 100, b.userId]),
      ).toBe("42501");
      expect(await sqlStateIn(client, "update client_payments set amount_paise = 1")).toBe("42501");
      expect(await sqlStateIn(client, "delete from client_payments")).toBe("42501");
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(await sqlState(system.query("update client_payments set amount_paise = 1"))).toBe(
        "42501",
      );
    } finally {
      await system.end();
    }
  });

  it("keeps packages, ledger and payments inside their workspace", async () => {
    await withContext(app, trainerContext(b), async (client) => {
      for (const table of ["client_packages", "package_session_ledger", "client_payments"]) {
        expect((await client.query(`select 1 from ${table}`)).rowCount).toBe(0);
      }
      // Pointing at another workspace's client or package fails the composite foreign keys.
      expect(await sqlStateIn(client, insertPackage, [b.workspaceId, clientA, b.userId])).toBe(
        "23503",
      );
      expect(
        await sqlStateIn(client, insertPayment, [b.workspaceId, packageA, 100, b.userId]),
      ).toBe("23503");
      // Writing into A's workspace is refused by the policy.
      expect(
        await sqlStateIn(client, insertPayment, [a.workspaceId, packageA, 100, b.userId]),
      ).toBe("42501");
      expect(
        (
          await client.query(
            "update client_packages set status = 'cancelled', closed_at = now() where client_id = $1",
            [clientA],
          )
        ).rowCount,
      ).toBe(0);
    });
    await withContext(app, {}, async (client) => {
      for (const table of ["client_packages", "package_session_ledger", "client_payments"]) {
        expect((await client.query(`select 1 from ${table}`)).rowCount).toBe(0);
      }
    });
  });

  it("keeps a suspended workspace's packages read-only", async () => {
    await owner.query("update workspaces set status = 'suspended' where id = $1", [a.workspaceId]);
    try {
      await withContext(app, trainerContext(a), async (client) => {
        expect((await client.query("select 1 from client_packages")).rowCount).toBeGreaterThan(0);
        expect(
          await sqlStateIn(client, insertPayment, [a.workspaceId, packageA, 100, a.userId]),
        ).toBe("42501");
        expect(
          (
            await client.query(
              "update client_packages set status = 'cancelled', closed_at = now() where status = 'active'",
            )
          ).rowCount,
        ).toBe(0);
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [a.workspaceId]);
    }
  });
});
