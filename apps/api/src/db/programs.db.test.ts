import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertProgram = `insert into programs (workspace_id, name, duration_weeks, days_per_week, created_by_user_id)
  values ($1, 'Own', 4, 1, $2) returning id`;
const insertWorkout = `insert into program_workouts (workspace_id, program_id, name, day_number, position)
  values ($1, $2, 'Day 1', 1, 1) returning id`;
const insertClient = `insert into clients (workspace_id, full_name, phone_e164, status, created_by_user_id, onboarded_at)
  values ($1, 'Asha R', $2, 'active', $3, now()) returning id`;
const insertAssignment = `insert into client_program_assignments (workspace_id, client_id, program_id, name,
  program_snapshot, schedule, starts_on, ends_on, created_by_user_id)
  values ($1, $2, $3, 'Own', '{}', '[{"workout_index":0,"weekday":1,"name":"Day 1"}]', '2031-01-06', '2031-02-02', $4)
  returning id`;
const insertSession = `insert into workout_sessions (workspace_id, client_id, assignment_id, workout_index, name, scheduled_on, status)
  values ($1, $2, $3, 0, 'Day 1', $4, $5) returning id`;

describe("program builder, assignments and planned sessions (step 3.4)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let programA: string;
  let clientA: string;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    [programA, clientA] = await committed(app, trainerContext(a), async (client) => {
      const program = await client.query<{ id: string }>(insertProgram, [a.workspaceId, a.userId]);
      const person = await client.query<{ id: string }>(insertClient, [
        a.workspaceId,
        "+919833300001",
        a.userId,
      ]);
      return [program.rows[0]?.id ?? "", person.rows[0]?.id ?? ""];
    });
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("lets a trainer build their own programs but never touch templates or other workspaces", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      const workout = await client.query<{ id: string }>(insertWorkout, [a.workspaceId, programA]);
      const library = await client.query<{ id: string }>(
        "select id from exercises where workspace_id is null limit 1",
      );
      await client.query(
        `insert into program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min)
         values ($1, $2, $3, 1, 3, 10)`,
        [a.workspaceId, workout.rows[0]?.id, library.rows[0]?.id],
      );
      expect(
        (await client.query("update programs set name = 'Renamed' where id = $1", [programA]))
          .rowCount,
      ).toBe(1);
      expect((await client.query("delete from program_exercises")).rowCount).toBe(1);
      expect((await client.query("delete from program_workouts")).rowCount).toBe(1);
      expect(await sqlStateIn(client, "delete from programs where id = $1", [programA])).toBe(
        "42501",
      );
      expect(await sqlStateIn(client, insertProgram, [a.workspaceId, b.userId])).toBe("42501");
      expect(
        (await client.query("update programs set name = 'x' where workspace_id is null")).rowCount,
      ).toBe(0);
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        (await client.query("select 1 from programs where id = $1", [programA])).rowCount,
      ).toBe(0);
      expect(
        (await client.query("update programs set name = 'x' where id = $1", [programA])).rowCount,
      ).toBe(0);
      // B can't see A's program, so the workspace trigger refuses before the policy would.
      expect(await sqlStateIn(client, insertWorkout, [a.workspaceId, programA])).toBe("23503");
      expect(await sqlStateIn(client, insertWorkout, [b.workspaceId, programA])).toBe("23503");
    });
  });

  it("assigns from the trainer's own program only, one active per client, and ends by status", async () => {
    const bProgram = await committed(app, trainerContext(b), async (client) => {
      const created = await client.query<{ id: string }>(insertProgram, [b.workspaceId, b.userId]);
      return created.rows[0]?.id ?? "";
    });
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertAssignment, [a.workspaceId, clientA, bProgram, a.userId]),
      ).toBe("42501");
      const first = await client.query<{ id: string }>(insertAssignment, [
        a.workspaceId,
        clientA,
        programA,
        a.userId,
      ]);
      expect(
        await sqlStateIn(client, insertAssignment, [a.workspaceId, clientA, programA, a.userId]),
      ).toBe("23505");
      expect(
        await sqlStateIn(
          client,
          "update client_program_assignments set status = 'ended' where id = $1",
          [first.rows[0]?.id],
        ),
      ).toBe("23514");
      expect(
        (
          await client.query(
            "update client_program_assignments set status = 'ended', ended_at = now() where id = $1",
            [first.rows[0]?.id],
          )
        ).rowCount,
      ).toBe(1);
      // Ended is final; snapshots and dates can't be rewritten.
      expect(
        (
          await client.query(
            "update client_program_assignments set status = 'active', ended_at = null where id = $1",
            [first.rows[0]?.id],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        await sqlStateIn(client, "update client_program_assignments set program_snapshot = '{}'"),
      ).toBe("42501");
      expect(await sqlStateIn(client, "delete from client_program_assignments")).toBe("42501");
    });
  });

  it("removes only planned sessions and keeps started ones as history", async () => {
    const assignment = await committed(app, trainerContext(a), async (client) => {
      const created = await client.query<{ id: string }>(insertAssignment, [
        a.workspaceId,
        clientA,
        programA,
        a.userId,
      ]);
      return created.rows[0]?.id ?? "";
    });
    await withContext(app, trainerContext(a), async (client) => {
      await client.query(insertSession, [
        a.workspaceId,
        clientA,
        assignment,
        "2031-01-06",
        "planned",
      ]);
      expect(
        await sqlStateIn(client, insertSession, [
          a.workspaceId,
          clientA,
          assignment,
          "2031-01-06",
          "planned",
        ]),
      ).toBe("23505");
      expect(
        await sqlStateIn(client, insertSession, [
          a.workspaceId,
          clientA,
          assignment,
          "2031-01-13",
          "completed",
        ]),
      ).toBe("42501");
      // Logging (step 3.5) may update sessions, but only along the lifecycle.
      expect(await sqlStateIn(client, "update workout_sessions set status = 'completed'")).toBe(
        "23514",
      );
      expect(await sqlStateIn(client, "update workout_sessions set name = 'x'")).toBe("42501");
    });
    // A session the client has started (step 3.5) can't be deleted by the trainer.
    await owner.query(
      `insert into workout_sessions (workspace_id, client_id, assignment_id, workout_index, name, scheduled_on, status, started_at)
       values ($1, $2, $3, 0, 'Day 1', '2031-01-20', 'in_progress', now())`,
      [a.workspaceId, clientA, assignment],
    );
    await withContext(app, trainerContext(a), async (client) => {
      expect((await client.query("delete from workout_sessions")).rowCount).toBe(0);
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect((await client.query("select 1 from workout_sessions")).rowCount).toBe(0);
      expect((await client.query("select 1 from client_program_assignments")).rowCount).toBe(0);
      expect(
        await sqlStateIn(client, insertSession, [
          b.workspaceId,
          clientA,
          assignment,
          "2031-01-27",
          "planned",
        ]),
      ).toBe("23503");
    });
    await withContext(app, {}, async (client) => {
      expect((await client.query("select 1 from workout_sessions")).rowCount).toBe(0);
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(await sqlState(system.query("delete from client_program_assignments"))).toBe("42501");
    } finally {
      await system.end();
    }
  });

  it("keeps a suspended workspace's programs and assignments read-only", async () => {
    await owner.query("update workspaces set status = 'suspended' where id = $1", [a.workspaceId]);
    try {
      await withContext(app, trainerContext(a), async (client) => {
        expect(await sqlStateIn(client, insertProgram, [a.workspaceId, a.userId])).toBe("42501");
        expect(
          (await client.query("update programs set name = 'x' where id = $1", [programA])).rowCount,
        ).toBe(0);
        expect((await client.query("delete from workout_sessions")).rowCount).toBe(0);
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [a.workspaceId]);
    }
  });
});
