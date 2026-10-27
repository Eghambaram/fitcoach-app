import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertProgram = `insert into programs (workspace_id, name, duration_weeks, days_per_week, created_by_user_id)
  values ($1, 'Own', 4, 1, $2) returning id`;
const insertClient = `insert into clients (workspace_id, full_name, phone_e164, status, created_by_user_id, onboarded_at)
  values ($1, 'Asha R', $2, 'active', $3, now()) returning id`;
const insertAssignment = `insert into client_program_assignments (workspace_id, client_id, program_id, name,
  program_snapshot, schedule, starts_on, ends_on, created_by_user_id)
  values ($1, $2, $3, 'Own', '{}', '[{"workout_index":0,"weekday":1,"name":"Day 1"}]', '2031-01-06', '2031-02-02', $4)
  returning id`;
const insertSession = `insert into workout_sessions (workspace_id, client_id, assignment_id, workout_index, name, scheduled_on)
  values ($1, $2, $3, 0, 'Day 1', $4) returning id`;
const insertAppointment = `insert into appointments (workspace_id, client_id, kind, starts_at, duration_min, ends_at, timezone, created_by_user_id)
  values ($1, $2, 'session', $3, 60, $3, 'Asia/Kolkata', $4) returning id`;
const insertExercise = `insert into workout_session_exercises (workspace_id, workout_session_id, position, exercise_id, planned_exercise_id, sets, reps_min)
  values ($1, $2, $3, $4, $4, 3, 10) returning id`;
const insertSet = `insert into workout_sets (id, workspace_id, workout_session_exercise_id, set_number, reps, load_kg, completed, completed_at)
  values ($1, $2, $3, $4, 10, 20, true, now())`;
const start = `update workout_sessions set status = 'in_progress', started_at = now() where id = $1`;

describe("live workout logging (step 3.5)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let clientA: string;
  let otherClientA: string;
  let assignmentA: string;
  let libraryExercise: string;
  let bExercise: string;
  let day = 0;

  /** A fresh planned session of client A, committed. */
  const plannedSession = () =>
    committed(app, trainerContext(a), async (client) => {
      day += 1;
      const scheduledOn = `2031-01-${String(day).padStart(2, "0")}`;
      const created = await client.query<{ id: string }>(insertSession, [
        a.workspaceId,
        clientA,
        assignmentA,
        scheduledOn,
      ]);
      return created.rows[0]?.id ?? "";
    });

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    [clientA, otherClientA, assignmentA] = await committed(
      app,
      trainerContext(a),
      async (client) => {
        const program = await client.query<{ id: string }>(insertProgram, [
          a.workspaceId,
          a.userId,
        ]);
        const person = await client.query<{ id: string }>(insertClient, [
          a.workspaceId,
          "+919833400001",
          a.userId,
        ]);
        const other = await client.query<{ id: string }>(insertClient, [
          a.workspaceId,
          "+919833400002",
          a.userId,
        ]);
        const assignment = await client.query<{ id: string }>(insertAssignment, [
          a.workspaceId,
          person.rows[0]?.id,
          program.rows[0]?.id,
          a.userId,
        ]);
        return [person.rows[0]?.id ?? "", other.rows[0]?.id ?? "", assignment.rows[0]?.id ?? ""];
      },
    );
    const library = await owner.query<{ id: string }>(
      "select id from exercises where workspace_id is null limit 1",
    );
    libraryExercise = library.rows[0]?.id ?? "";
    bExercise = await committed(app, trainerContext(b), async (client) => {
      const created = await client.query<{ id: string }>(
        `insert into exercises (workspace_id, name, category, muscle_groups, equipment, created_by_user_id)
         values ($1, 'B only', 'strength', array['chest'], array['dumbbell'], $2) returning id`,
        [b.workspaceId, b.userId],
      );
      return created.rows[0]?.id ?? "";
    });
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("writes exercises and sets only while the workout is in progress", async () => {
    const session = await plannedSession();
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertExercise, [a.workspaceId, session, 1, libraryExercise]),
      ).toBe("42501");
      // A started workout needs started_at (lifecycle CHECK).
      expect(
        await sqlStateIn(
          client,
          "update workout_sessions set status = 'in_progress' where id = $1",
          [session],
        ),
      ).toBe("23514");
      expect((await client.query(start, [session])).rowCount).toBe(1);
      const item = await client.query<{ id: string }>(insertExercise, [
        a.workspaceId,
        session,
        1,
        libraryExercise,
      ]);
      const exerciseId = item.rows[0]?.id;
      const setId = randomUUID();
      await client.query(insertSet, [setId, a.workspaceId, exerciseId, 1]);
      expect(
        await sqlStateIn(client, insertSet, [randomUUID(), a.workspaceId, exerciseId, 1]),
      ).toBe("23505");
      expect(
        (await client.query("update workout_sets set reps = 12 where id = $1", [setId])).rowCount,
      ).toBe(1);
      expect(
        await sqlStateIn(client, "update workout_sets set completed = false where id = $1", [
          setId,
        ]),
      ).toBe("23514");
      expect(await sqlStateIn(client, "delete from workout_sets")).toBe("42501");
      expect(await sqlStateIn(client, "delete from workout_session_exercises")).toBe("42501");
      expect(
        await sqlStateIn(
          client,
          "update workout_session_exercises set exercise_id = $1 where id = $2",
          [bExercise, exerciseId],
        ),
      ).toBe("23503");
      expect(
        await sqlStateIn(client, "update workout_session_exercises set sets = 9 where id = $1", [
          exerciseId,
        ]),
      ).toBe("42501");

      // Finished workouts are history.
      expect(
        (
          await client.query(
            "update workout_sessions set status = 'completed', completed_at = now() where id = $1",
            [session],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (await client.query("update workout_sets set reps = 1 where id = $1", [setId])).rowCount,
      ).toBe(0);
      expect(
        await sqlStateIn(client, insertSet, [randomUUID(), a.workspaceId, exerciseId, 2]),
      ).toBe("42501");
      expect(
        (
          await client.query("update workout_sessions set status = 'skipped' where id = $1", [
            session,
          ])
        ).rowCount,
      ).toBe(0);
    });
  });

  it("links only the same client's appointment, once", async () => {
    const [first, second] = [await plannedSession(), await plannedSession()];
    await withContext(app, trainerContext(a), async (client) => {
      const mine = await client.query<{ id: string }>(insertAppointment, [
        a.workspaceId,
        clientA,
        new Date(Date.UTC(2031, 0, 6, 4)),
        a.userId,
      ]);
      const theirs = await client.query<{ id: string }>(insertAppointment, [
        a.workspaceId,
        otherClientA,
        new Date(Date.UTC(2031, 0, 6, 6)),
        a.userId,
      ]);
      expect(
        await sqlStateIn(client, "update workout_sessions set appointment_id = $1 where id = $2", [
          theirs.rows[0]?.id,
          first,
        ]),
      ).toBe("23503");
      await client.query("update workout_sessions set appointment_id = $1 where id = $2", [
        mine.rows[0]?.id,
        first,
      ]);
      expect(
        await sqlStateIn(client, "update workout_sessions set appointment_id = $1 where id = $2", [
          mine.rows[0]?.id,
          second,
        ]),
      ).toBe("23505");
    });
  });

  it("keeps other workspaces and an empty context out", async () => {
    const session = await plannedSession();
    const exerciseId = await committed(app, trainerContext(a), async (client) => {
      await client.query(start, [session]);
      const item = await client.query<{ id: string }>(insertExercise, [
        a.workspaceId,
        session,
        1,
        libraryExercise,
      ]);
      await client.query(insertSet, [randomUUID(), a.workspaceId, item.rows[0]?.id, 1]);
      return item.rows[0]?.id ?? "";
    });
    await withContext(app, trainerContext(a), async (client) => {
      // Another workspace's custom exercise can't be logged here.
      expect(await sqlStateIn(client, insertExercise, [a.workspaceId, session, 2, bExercise])).toBe(
        "23503",
      );
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect((await client.query("select 1 from workout_session_exercises")).rowCount).toBe(0);
      expect((await client.query("select 1 from workout_sets")).rowCount).toBe(0);
      expect((await client.query(start, [session])).rowCount).toBe(0);
      expect((await client.query("update workout_sets set reps = 1")).rowCount).toBe(0);
      expect(
        await sqlStateIn(client, insertSet, [randomUUID(), b.workspaceId, exerciseId, 2]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertSet, [randomUUID(), a.workspaceId, exerciseId, 2]),
      ).toBe("42501");
      expect(
        await sqlStateIn(client, insertExercise, [b.workspaceId, session, 2, libraryExercise]),
      ).toBe("42501");
    });
    await withContext(app, {}, async (client) => {
      expect((await client.query("select 1 from workout_session_exercises")).rowCount).toBe(0);
      expect((await client.query("select 1 from workout_sets")).rowCount).toBe(0);
    });
    const system = createPool(inject("db").systemUrl);
    try {
      expect(await sqlState(system.query("truncate workout_sets"))).toBe("42501");
    } finally {
      await system.end();
    }
  });

  it("keeps a suspended workspace's workouts read-only", async () => {
    const session = await plannedSession();
    await owner.query("update workspaces set status = 'suspended' where id = $1", [a.workspaceId]);
    try {
      await withContext(app, trainerContext(a), async (client) => {
        expect((await client.query(start, [session])).rowCount).toBe(0);
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [a.workspaceId]);
    }
  });
});
