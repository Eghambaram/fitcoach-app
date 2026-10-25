import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertClient = `insert into clients (workspace_id, full_name, status, created_by_user_id, onboarded_at)
  values ($1, 'Asha R', 'active', $2, now()) returning id`;
const insertAppointment = `
  insert into appointments (workspace_id, client_id, lead_id, kind, starts_at, duration_min, ends_at, timezone, status, created_by_user_id)
  values ($1, $2, $3, 'session', $4, $5, $4, 'Asia/Kolkata', $6, $7) returning id, ends_at`;

const at = (hours: number) => new Date(Date.UTC(2031, 0, 6, hours, 0, 0));

describe("scheduling tables (step 2.6)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let clientA: string;
  let clientB: string;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    const client = (trainer: Trainer) =>
      committed(app, trainerContext(trainer), async (db) => {
        const { rows } = await db.query<{ id: string }>(insertClient, [
          trainer.workspaceId,
          trainer.userId,
        ]);
        return rows[0]?.id ?? "";
      });
    clientA = await client(a);
    clientB = await client(b);
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("maintains ends_at from the duration, whatever is sent", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const { rows } = await client.query<{ id: string; ends_at: Date }>(insertAppointment, [
        a.workspaceId,
        clientA,
        null,
        at(1),
        45,
        "scheduled",
        a.userId,
      ]);
      expect(rows[0]?.ends_at.toISOString()).toBe("2031-01-06T01:45:00.000Z");
      const { rows: moved } = await client.query<{ ends_at: Date }>(
        "update appointments set duration_min = 90 where id = $1 returning ends_at",
        [rows[0]?.id],
      );
      expect(moved[0]?.ends_at.toISOString()).toBe("2031-01-06T02:30:00.000Z");
    });
  });

  it("refuses overlapping live appointments in a workspace, but not cancelled ones or other workspaces", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const first = await client.query<{ id: string }>(insertAppointment, [
        a.workspaceId,
        clientA,
        null,
        at(3),
        60,
        "scheduled",
        a.userId,
      ]);
      expect(
        await sqlStateIn(client, insertAppointment, [
          a.workspaceId,
          clientA,
          null,
          new Date(at(3).getTime() + 30 * 60_000),
          60,
          "confirmed",
          a.userId,
        ]),
      ).toBe("23P01");
      // Back to back is fine.
      expect(
        await sqlStateIn(client, insertAppointment, [
          a.workspaceId,
          clientA,
          null,
          at(4),
          60,
          "scheduled",
          a.userId,
        ]),
      ).toBeUndefined();
      await client.query(
        "update appointments set status = 'cancelled', cancelled_at = now(), cancel_reason = 'ill' where id = $1",
        [first.rows[0]?.id],
      );
      expect(
        await sqlStateIn(client, insertAppointment, [
          a.workspaceId,
          clientA,
          null,
          at(3),
          60,
          "scheduled",
          a.userId,
        ]),
      ).toBeUndefined();
      // A cancelled appointment is final.
      const reopened = await client.query(
        "update appointments set status = 'scheduled', cancelled_at = null, cancel_reason = null where id = $1",
        [first.rows[0]?.id],
      );
      expect(reopened.rowCount).toBe(0);
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        await sqlStateIn(client, insertAppointment, [
          b.workspaceId,
          clientB,
          null,
          at(3),
          60,
          "scheduled",
          b.userId,
        ]),
      ).toBeUndefined();
    });
  });

  it("needs exactly one person, from the trainer's own workspace, and a signed live booking", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertAppointment, [
          a.workspaceId,
          null,
          null,
          at(8),
          60,
          "scheduled",
          a.userId,
        ]),
      ).toBe("23514");
      expect(
        await sqlStateIn(client, insertAppointment, [
          a.workspaceId,
          clientB,
          null,
          at(8),
          60,
          "scheduled",
          a.userId,
        ]),
      ).toBe("23503");
      expect(
        await sqlStateIn(client, insertAppointment, [
          b.workspaceId,
          clientB,
          null,
          at(8),
          60,
          "scheduled",
          a.userId,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertAppointment, [
          a.workspaceId,
          clientA,
          null,
          at(8),
          60,
          "scheduled",
          b.userId,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertAppointment, [
          a.workspaceId,
          clientA,
          null,
          at(8),
          60,
          "completed",
          a.userId,
        ]),
      ).toBe("42501");
      expect(await sqlStateIn(client, "delete from appointments")).toBe("42501");
      expect(
        await sqlStateIn(client, "update appointments set client_id = null, lead_id = null"),
      ).toBe("42501");
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        (await client.query("select 1 from appointments where workspace_id = $1", [a.workspaceId]))
          .rowCount,
      ).toBe(0);
      expect(
        (
          await client.query("update appointments set notes = 'x' where workspace_id = $1", [
            a.workspaceId,
          ])
        ).rowCount,
      ).toBe(0);
    });
  });

  it("keeps history insert-only and series per workspace", async () => {
    const id = await committed(app, trainerContext(a), async (client) => {
      const { rows } = await client.query<{ id: string }>(insertAppointment, [
        a.workspaceId,
        clientA,
        null,
        at(12),
        60,
        "scheduled",
        a.userId,
      ]);
      return rows[0]?.id ?? "";
    });
    const insertChange = `insert into appointment_changes (workspace_id, appointment_id, kind, actor_user_id)
      values ($1, $2, 'created', $3)`;
    await withContext(app, trainerContext(a), async (client) => {
      expect(await sqlStateIn(client, insertChange, [a.workspaceId, id, a.userId])).toBeUndefined();
      expect(await sqlStateIn(client, insertChange, [a.workspaceId, id, b.userId])).toBe("42501");
      expect(await sqlStateIn(client, "update appointment_changes set data = '{}'")).toBe("42501");
      expect(
        await sqlStateIn(
          client,
          `insert into appointment_series (workspace_id, client_id, kind, weekdays, start_time, duration_min, timezone, starts_on, occurrence_count, created_by_user_id)
           values ($1, $2, 'session', '{1,3,5}', '07:00', 60, 'Asia/Kolkata', '2031-01-06', 60, $3)`,
          [a.workspaceId, clientA, a.userId],
        ),
      ).toBe("23514");
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(await sqlStateIn(client, insertChange, [b.workspaceId, id, b.userId])).toBe("23503");
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(await sqlState(system.query("update appointment_changes set data = '{}'"))).toBe(
        "42501",
      );
      expect(await sqlState(system.query("delete from appointments"))).toBe("42501");
    } finally {
      await system.end();
    }
  });

  it("shows nothing to an empty context and keeps a suspended workspace read-only", async () => {
    await withContext(app, {}, async (client) => {
      for (const table of ["appointments", "appointment_series", "appointment_changes"]) {
        expect((await client.query(`select 1 from ${table}`)).rowCount).toBe(0);
      }
    });
    await owner.query("update workspaces set status = 'suspended' where id = $1", [b.workspaceId]);
    try {
      await withContext(app, trainerContext(b), async (client) => {
        expect(
          await sqlStateIn(client, insertAppointment, [
            b.workspaceId,
            clientB,
            null,
            at(20),
            60,
            "scheduled",
            b.userId,
          ]),
        ).toBe("42501");
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [b.workspaceId]);
    }
  });
});
