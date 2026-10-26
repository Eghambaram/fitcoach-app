import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { committed, createPool, sqlState, sqlStateIn, withContext } from "../test/db";
import { createTrainer, drizzleFor, trainerContext } from "../test/fixtures";

type Trainer = Awaited<ReturnType<typeof createTrainer>>;

const insertExercise = `insert into exercises (workspace_id, name, category, muscle_groups, equipment, created_by_user_id)
  values ($1, $2, 'strength', array['chest'], array['dumbbell'], $3) returning id`;

describe("exercise library and starter templates (step 3.3)", () => {
  let owner: Pool;
  let app: Pool;
  let a: Trainer;
  let b: Trainer;
  let customA: string;

  beforeAll(async () => {
    const db = inject("db");
    owner = createPool(db.ownerUrl);
    app = createPool(db.appUrl);
    const system = createPool(db.systemUrl);
    a = await createTrainer(drizzleFor(system));
    b = await createTrainer(drizzleFor(system));
    await system.end();
    customA = await committed(app, trainerContext(a), async (client) => {
      const { rows } = await client.query<{ id: string }>(insertExercise, [
        a.workspaceId,
        "Landmine Press",
        a.userId,
      ]);
      return rows[0]?.id ?? "";
    });
  });

  afterAll(async () => {
    await Promise.all([owner.end(), app.end()]);
  });

  it("seeds ~100 global exercises and 7 templates that only use them", async () => {
    const { rows } = await owner.query<{
      exercises: number;
      templates: number;
      foreign: number;
      empty: number;
    }>(`select
      (select count(*)::int from exercises where workspace_id is null) as exercises,
      (select count(*)::int from programs where workspace_id is null and is_template) as templates,
      (select count(*)::int from program_exercises pe join exercises e on e.id = pe.exercise_id
        where pe.workspace_id is null and e.workspace_id is not null) as foreign,
      (select count(*)::int from program_workouts w where w.workspace_id is null
        and not exists (select 1 from program_exercises pe where pe.program_workout_id = w.id)) as empty`);
    expect(rows[0]?.exercises).toBeGreaterThanOrEqual(100);
    expect(rows[0]?.templates).toBe(7);
    expect(rows[0]?.foreign).toBe(0);
    expect(rows[0]?.empty).toBe(0);
  });

  it("lets every trainer read the library and templates, but write neither", async () => {
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        (await client.query("select 1 from exercises where workspace_id is null")).rowCount,
      ).toBeGreaterThanOrEqual(100);
      expect((await client.query("select 1 from programs")).rowCount).toBe(7);
      expect((await client.query("select 1 from program_exercises")).rowCount).toBeGreaterThan(0);
      expect(
        (await client.query("update exercises set name = 'x' where workspace_id is null")).rowCount,
      ).toBe(0);
      expect(
        await sqlStateIn(client, insertExercise, [null, "Global by a trainer", b.userId]),
      ).toBe("42501");
      expect(await sqlStateIn(client, "delete from exercises where workspace_id is null")).toBe(
        "42501",
      );
      // Programs are never deleted; since step 3.4 a trainer may delete and update their own
      // workouts and exercises, but the policies leave every global template row untouched.
      expect(await sqlStateIn(client, "delete from programs")).toBe("42501");
      expect((await client.query("update programs set name = name")).rowCount).toBe(0);
      for (const table of ["program_workouts", "program_exercises"]) {
        expect((await client.query(`delete from ${table}`)).rowCount).toBe(0);
        expect((await client.query(`update ${table} set position = position`)).rowCount).toBe(0);
      }
    });
    await withContext(app, {}, async (client) => {
      expect(
        (await client.query("select 1 from exercises where workspace_id is not null")).rowCount,
      ).toBe(0);
    });
  });

  it("keeps custom exercises per workspace, signed, unique by name and archivable", async () => {
    await withContext(app, trainerContext(a), async (client) => {
      expect(
        await sqlStateIn(client, insertExercise, [a.workspaceId, "landmine press", a.userId]),
      ).toBe("23505");
      expect(
        await sqlStateIn(client, insertExercise, [a.workspaceId, "Signed by B", b.userId]),
      ).toBe("42501");
      // A custom exercise may share a library name.
      expect(
        await sqlStateIn(client, insertExercise, [a.workspaceId, "Push-Up", a.userId]),
      ).toBeUndefined();
      expect(
        (await client.query("update exercises set archived_at = now() where id = $1", [customA]))
          .rowCount,
      ).toBe(1);
      // Archived names are free again; substitutions are library-only.
      expect(
        await sqlStateIn(client, insertExercise, [a.workspaceId, "Landmine Press", a.userId]),
      ).toBeUndefined();
      expect(
        await sqlStateIn(client, "update exercises set substitution_ids = '{}' where id = $1", [
          customA,
        ]),
      ).toBe("42501");
      expect(
        await sqlStateIn(
          client,
          `insert into exercises (workspace_id, name, category, muscle_groups, equipment, created_by_user_id)
           values ($1, 'Bad', 'strength', array['wings'], array['dumbbell'], $2)`,
          [a.workspaceId, a.userId],
        ),
      ).toBe("23514");
      expect(await sqlStateIn(client, "delete from exercises where id = $1", [customA])).toBe(
        "42501",
      );
    });
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        (await client.query("select 1 from exercises where id = $1", [customA])).rowCount,
      ).toBe(0);
      expect(
        (await client.query("update exercises set name = 'x' where id = $1", [customA])).rowCount,
      ).toBe(0);
      expect(await sqlStateIn(client, insertExercise, [a.workspaceId, "Into A", b.userId])).toBe(
        "42501",
      );
    });
  });

  it("refuses a planned exercise from another workspace, and mixes of global and tenant rows", async () => {
    const { rows } = await owner.query<{ workout: string; program: string }>(
      "select w.id as workout, w.program_id as program from program_workouts w where w.workspace_id is null limit 1",
    );
    const globalWorkout = rows[0]?.workout ?? "";
    const globalProgram = rows[0]?.program ?? "";
    // A global template can't use a custom exercise…
    expect(
      await sqlState(
        owner.query(
          `insert into program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min)
           values (null, $1, $2, 99, 3, 10)`,
          [globalWorkout, customA],
        ),
      ),
    ).toBe("23503");
    // …and a tenant row can't hang off a global program or workout.
    expect(
      await sqlState(
        owner.query(
          "insert into program_workouts (workspace_id, program_id, name, day_number, position) values ($1, $2, 'x', 1, 99)",
          [a.workspaceId, globalProgram],
        ),
      ),
    ).toBe("23503");
    const tenant = await owner.query<{ program: string; workout: string }>(
      `with p as (insert into programs (workspace_id, name, duration_weeks, days_per_week)
                  values ($1, 'Own', 4, 1) returning id),
            w as (insert into program_workouts (workspace_id, program_id, name, day_number, position)
                  select $1, p.id, 'Day 1', 1, 1 from p returning id, program_id)
       select program_id as program, id as workout from w`,
      [a.workspaceId],
    );
    const ownWorkout = tenant.rows[0]?.workout ?? "";
    const plan = (exerciseId: string) =>
      sqlState(
        owner.query(
          `insert into program_exercises (workspace_id, program_workout_id, exercise_id, position, sets, reps_min)
           values ($1, $2, $3, (select coalesce(max(position), 0) + 1 from program_exercises where program_workout_id = $2), 3, 10)`,
          [a.workspaceId, ownWorkout, exerciseId],
        ),
      );
    const bExercise = await committed(app, trainerContext(b), async (client) => {
      const created = await client.query<{ id: string }>(insertExercise, [
        b.workspaceId,
        "B only",
        b.userId,
      ]);
      return created.rows[0]?.id ?? "";
    });
    const library = await owner.query<{ id: string }>(
      "select id from exercises where workspace_id is null limit 1",
    );
    expect(await plan(library.rows[0]?.id ?? "")).toBeUndefined();
    expect(await plan(customA)).toBeUndefined();
    expect(await plan(bExercise)).toBe("23503");
    await withContext(app, trainerContext(b), async (client) => {
      expect(
        (await client.query("select 1 from programs where id = $1", [tenant.rows[0]?.program]))
          .rowCount,
      ).toBe(0);
    });
  });

  it("keeps a suspended workspace's custom exercises read-only", async () => {
    await owner.query("update workspaces set status = 'suspended' where id = $1", [a.workspaceId]);
    try {
      await withContext(app, trainerContext(a), async (client) => {
        expect(
          await sqlStateIn(client, insertExercise, [a.workspaceId, "While suspended", a.userId]),
        ).toBe("42501");
        expect(
          (await client.query("update exercises set name = 'x' where id = $1", [customA])).rowCount,
        ).toBe(0);
      });
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [a.workspaceId]);
    }
  });
});
