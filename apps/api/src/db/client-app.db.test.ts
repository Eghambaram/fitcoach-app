import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertClient = `insert into clients (workspace_id, full_name, phone_e164, status, created_by_user_id, onboarded_at)
  values ($1, $2, $3, 'active', $4, now()) returning id`;
const insertProgram = `insert into programs (workspace_id, name, duration_weeks, days_per_week, created_by_user_id)
  values ($1, 'Own', 4, 1, $2) returning id`;
const insertAssignment = `insert into client_program_assignments (workspace_id, client_id, program_id, name,
  program_snapshot, schedule, starts_on, ends_on, created_by_user_id)
  values ($1, $2, $3, 'Own', '{}', '[{"workout_index":0,"weekday":1,"name":"Day 1"}]', '2031-01-06', '2031-02-02', $4)
  returning id`;
const insertSession = `insert into workout_sessions (workspace_id, client_id, assignment_id, workout_index, name, scheduled_on)
  values ($1, $2, $3, 0, 'Day 1', $4) returning id`;
const insertAppointment = `insert into appointments (workspace_id, client_id, kind, starts_at, duration_min, ends_at, timezone, notes, created_by_user_id)
  values ($1, $2, 'session', $3, 60, $3, 'Asia/Kolkata', 'Trainer-only note', $4) returning id`;
const insertPackage = `insert into client_packages (workspace_id, client_id, name, kind, sessions_included, starts_on, expires_on, price_paise, amount_due_paise, created_by_user_id)
  values ($1, $2, '12 sessions', 'session_pack', 12, '2031-01-01', '2031-03-01', 1200000, 1000000, $3) returning id`;

describe("client app reads and writes (step 4.2)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let asha: string;
  let ravi: string;
  let ashaSession: string;
  let raviSession: string;
  let bExercise: string;
  let day = 0;

  const portal = (clientId: string, workspaceId = a.workspaceId) => ({
    userId: a.userId,
    workspaceId,
    clientId,
    actor: "client" as const,
  });
  const plan = (clientId: string, assignment: string) =>
    committed(app, trainerContext(a), async (client) => {
      day += 1;
      const created = await client.query<{ id: string }>(insertSession, [
        a.workspaceId,
        clientId,
        assignment,
        `2031-01-${String(day).padStart(2, "0")}`,
      ]);
      return created.rows[0]?.id ?? "";
    });
  const setSelfLogging = (on: boolean) =>
    owner.query(
      `update clients set features = jsonb_set(features, '{workoutSelfLogging}', $1::jsonb) where id = $2`,
      [on ? "true" : "false", asha],
    );

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    const [ashaAssignment, raviAssignment] = await committed(
      app,
      trainerContext(a),
      async (client) => {
        const program = await client.query<{ id: string }>(insertProgram, [
          a.workspaceId,
          a.userId,
        ]);
        const first = await client.query<{ id: string }>(insertClient, [
          a.workspaceId,
          "Asha Rao",
          "+919855500001",
          a.userId,
        ]);
        const second = await client.query<{ id: string }>(insertClient, [
          a.workspaceId,
          "Ravi K",
          "+919855500002",
          a.userId,
        ]);
        asha = first.rows[0]?.id ?? "";
        ravi = second.rows[0]?.id ?? "";
        const one = await client.query<{ id: string }>(insertAssignment, [
          a.workspaceId,
          asha,
          program.rows[0]?.id,
          a.userId,
        ]);
        const two = await client.query<{ id: string }>(insertAssignment, [
          a.workspaceId,
          ravi,
          program.rows[0]?.id,
          a.userId,
        ]);
        await client.query(insertAppointment, [
          a.workspaceId,
          asha,
          new Date(Date.UTC(2031, 0, 6, 4)),
          a.userId,
        ]);
        await client.query(insertAppointment, [
          a.workspaceId,
          ravi,
          new Date(Date.UTC(2031, 0, 6, 6)),
          a.userId,
        ]);
        const pkg = await client.query<{ id: string }>(insertPackage, [
          a.workspaceId,
          asha,
          a.userId,
        ]);
        await client.query(
          `insert into package_session_ledger (workspace_id, package_id, reason, sessions_used, note, actor_user_id)
         values ($1, $2, 'manual_adjustment', 3, 'Used before FitCoach', $3)`,
          [a.workspaceId, pkg.rows[0]?.id, a.userId],
        );
        await client.query(
          `insert into client_goals (workspace_id, client_id, kind, goal, created_by_user_id) values ($1, $2, 'primary', 'build_muscle', $3)`,
          [a.workspaceId, asha, a.userId],
        );
        return [one.rows[0]?.id ?? "", two.rows[0]?.id ?? ""];
      },
    );
    ashaSession = await plan(asha, ashaAssignment);
    raviSession = await plan(ravi, raviAssignment);
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

  it("shows a client only their own program, workouts and goals", async () => {
    await withContext(app, portal(asha), async (client) => {
      const sessions = await client.query<{ id: string }>("select id from workout_sessions");
      expect(sessions.rows.map((row) => row.id)).toEqual([ashaSession]);
      expect((await client.query("select 1 from client_program_assignments")).rowCount).toBe(1);
      expect((await client.query("select 1 from client_goals")).rowCount).toBe(1);
      expect(
        (await client.query("select 1 from exercises where id = $1", [bExercise])).rowCount,
      ).toBe(0);
      expect(
        (await client.query("select 1 from workout_sessions where id = $1", [raviSession]))
          .rowCount,
      ).toBe(0);
    });
    await withContext(app, portal(asha, b.workspaceId), async (client) => {
      expect((await client.query("select 1 from workout_sessions")).rowCount).toBe(0);
    });
  });

  it("serves appointments without notes and packages without prices", async () => {
    await withContext(app, portal(asha), async (client) => {
      const rows = await client.query<{ client_id: string }>(
        "select client_id from client_portal_appointments",
      );
      expect(rows.rows.map((row) => row.client_id)).toEqual([asha]);
      expect(await sqlStateIn(client, "select notes from client_portal_appointments")).toBe(
        "42703",
      );
      // No direct access to the table behind it.
      expect((await client.query("select 1 from appointments")).rowCount).toBe(0);

      const pkg = await client.query<{ sessions_left: number }>(
        "select sessions_left from client_portal_packages",
      );
      expect(pkg.rows).toEqual([{ sessions_left: 9 }]);
      for (const column of ["price_paise", "amount_due_paise", "notes"]) {
        expect(
          await sqlStateIn(client, `select ${column} from client_portal_packages`),
          column,
        ).toBe("42703");
      }
      expect((await client.query("select 1 from client_packages")).rowCount).toBe(0);
      expect((await client.query("select 1 from package_session_ledger")).rowCount).toBe(0);
    });
    for (const context of [trainerContext(a), trainerContext(b), {}, portal(ravi, b.workspaceId)]) {
      await withContext(app, context, async (client) => {
        expect((await client.query("select 1 from client_portal_appointments")).rowCount).toBe(0);
        expect((await client.query("select 1 from client_portal_packages")).rowCount).toBe(0);
      });
    }
  });

  it("lets a client log their own workout only with self-logging on, and only their own fields", async () => {
    const start = `update workout_sessions set status = 'in_progress', started_at = now() where id = $1`;
    await setSelfLogging(false);
    await withContext(app, portal(asha), async (client) => {
      expect((await client.query(start, [ashaSession])).rowCount).toBe(0);
    });
    await setSelfLogging(true);
    try {
      await withContext(app, portal(asha), async (client) => {
        expect((await client.query(start, [raviSession])).rowCount).toBe(0);
        expect((await client.query(start, [ashaSession])).rowCount).toBe(1);
        const library = await client.query<{ id: string }>(
          "select id from exercises where workspace_id is null limit 1",
        );
        const item = await client.query<{ id: string }>(
          `insert into workout_session_exercises (workspace_id, workout_session_id, position, exercise_id, planned_exercise_id, sets, reps_min)
           values ($1, $2, 1, $3, $3, 3, 10) returning id`,
          [a.workspaceId, ashaSession, library.rows[0]?.id],
        );
        await client.query(
          `insert into workout_sets (id, workspace_id, workout_session_exercise_id, set_number, reps, completed, completed_at)
           values (gen_random_uuid(), $1, $2, 1, 10, true, now())`,
          [a.workspaceId, item.rows[0]?.id],
        );
        for (const change of [
          "trainer_feedback = 'x'",
          "skip_reason = 'x'",
          "status = 'skipped'",
        ]) {
          expect(
            await sqlStateIn(client, `update workout_sessions set ${change} where id = $1`, [
              ashaSession,
            ]),
            change,
          ).toBe("42501");
        }
        expect(
          (
            await client.query(
              "update workout_sessions set status = 'completed', completed_at = now(), client_feedback = 'Tough' where id = $1",
              [ashaSession],
            )
          ).rowCount,
        ).toBe(1);
      });
      await withContext(app, trainerContext(a), async (client) => {
        expect(
          await sqlStateIn(
            client,
            "update workout_sessions set client_feedback = 'x' where id = $1",
            [raviSession],
          ),
        ).toBe("42501");
      });
    } finally {
      await setSelfLogging(false);
    }
  });

  it("changes a client's preferences only through the narrow function", async () => {
    await withContext(app, portal(asha), async (client) => {
      await client.query("select app.client_update_preferences('email', 'lb', 'in')");
      const row = await client.query(
        "select preferred_contact, weight_unit, length_unit from clients",
      );
      expect(row.rows).toEqual([
        { preferred_contact: "email", weight_unit: "lb", length_unit: "in" },
      ]);
      expect(
        await sqlStateIn(client, "select app.client_update_preferences('email', 'stone', 'in')"),
      ).toBe("23514");
      expect((await client.query("update clients set full_name = 'x'")).rowCount).toBe(0);
      expect((await client.query("select * from app.client_default_units()")).rowCount).toBe(1);
    });
    const ravis = await owner.query("select weight_unit from clients where id = $1", [ravi]);
    expect(ravis.rows).toEqual([{ weight_unit: null }]);
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, "select app.client_update_preferences('email', 'kg', 'cm')"),
      ).toBe("42501");
      expect((await client.query("select * from app.client_default_units()")).rowCount).toBe(0);
    });
  });
});
