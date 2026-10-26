import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { ProgramDetail, ProgramInput } from "@fitcoach/shared";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";
import { AssignmentsService } from "./assignments.service";

let app: INestApplication;
let system: Pool;
let owner: Pool;
const { signedInTrainer } = createHttpHelpers(
  () => app,
  () => system,
);
type SignedIn = Awaited<ReturnType<typeof signedInTrainer>>;

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
  owner = createPool(inject("db").ownerUrl);
});

afterAll(async () => {
  await app.close();
  await Promise.all([system.end(), owner.end()]);
});

const ZONE = "Asia/Kolkata";
const day = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
const isoWeekday = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`).getUTCDay();
  return value === 0 ? 7 : value;
};

let counter = 0;
async function newClient(trainer: SignedIn): Promise<string> {
  const response = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName: "Asha Rao",
      phone: `94${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`,
      primaryGoal: "build_muscle",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    })
    .set("Idempotency-Key", randomUUID());
  expect(response.status).toBe(201);
  return response.body.clientId;
}

async function templateId(trainer: SignedIn, name: string): Promise<string> {
  const { body } = await trainer.http.get("/v1/programs/templates");
  return body.templates.find((t: { name: string }) => t.name === name).id;
}

async function fromTemplate(trainer: SignedIn, name = "Beginner Full Body 3×/week") {
  const response = await trainer.http.post("/v1/programs", {
    fromProgramId: await templateId(trainer, name),
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as ProgramDetail;
}

/** The detail as a save body. */
function toInput(program: ProgramDetail): ProgramInput {
  return {
    name: program.name,
    description: program.description ?? undefined,
    goal: program.goal,
    durationWeeks: program.durationWeeks,
    workouts: program.workouts.map((workout) => ({
      name: workout.name,
      dayNumber: workout.dayNumber,
      notes: workout.notes ?? undefined,
      exercises: workout.exercises.map((item) => ({
        exerciseId: item.exercise.id,
        sets: item.sets,
        repsMin: item.repsMin,
        repsMax: item.repsMax,
        durationSeconds: item.durationSeconds,
        targetLoadKg: item.targetLoadKg,
        restSeconds: item.restSeconds,
        trainerNotes: item.trainerNotes ?? undefined,
        clientInstructions: item.clientInstructions ?? undefined,
      })),
    })),
  };
}

/** items[index], or a test failure. */
function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`nothing at index ${index}`);
  return item;
}

const scheduleOf = (program: ProgramDetail) =>
  program.workouts.map((workout, workoutIndex) => ({ workoutIndex, weekday: workout.dayNumber }));

describe("program builder", () => {
  it("starts from a template, saves edits in order and keeps the template unchanged", async () => {
    const trainer = await signedInTrainer();
    const copy = await fromTemplate(trainer);
    expect(copy).toMatchObject({
      name: "Beginner Full Body 3×/week",
      global: false,
      isTemplate: false,
    });
    expect(copy.workouts.map((w) => w.dayNumber)).toEqual([1, 3, 5]);

    const input = toInput(copy);
    const first = input.workouts[0];
    if (!first) throw new Error("no workout");
    first.exercises.reverse();
    first.exercises[0] = {
      ...at(first.exercises, 0),
      sets: 4,
      targetLoadKg: 12.5,
      trainerNotes: "Slow lowering",
    };
    input.workouts.pop();
    input.name = "Asha's first block";
    const saved = await trainer.http.put(`/v1/programs/${copy.id}`, input);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.name).toBe("Asha's first block");
    expect(saved.body.daysPerWeek).toBe(2);
    expect(saved.body.workouts[0].exercises[0]).toMatchObject({
      position: 1,
      sets: 4,
      targetLoadKg: 12.5,
      trainerNotes: "Slow lowering",
      exercise: { name: copy.workouts[0]?.exercises.at(-1)?.exercise.name },
    });

    const template = (await trainer.http.get("/v1/programs/templates")).body.templates[0];
    expect(template.workouts).toHaveLength(3);
    const locked = await trainer.http.put(`/v1/programs/${template.id}`, input);
    expect(locked.status).toBe(403);
    expect((await trainer.http.post(`/v1/programs/${template.id}/archive`)).status).toBe(403);
  });

  it("refuses impossible programs with field errors", async () => {
    const trainer = await signedInTrainer();
    const other = await signedInTrainer();
    const copy = await fromTemplate(trainer);
    const input = toInput(copy);
    const twice = structuredClone(input);
    at(twice.workouts, 1).dayNumber = at(twice.workouts, 0).dayNumber;
    const dup = await trainer.http.put(`/v1/programs/${copy.id}`, twice);
    expect(dup.status).toBe(400);
    expect(Object.keys(dup.body.fieldErrors)).toContain("workouts.1.dayNumber");

    const both = structuredClone(input);
    at(at(both.workouts, 0).exercises, 0).durationSeconds = 30;
    expect((await trainer.http.put(`/v1/programs/${copy.id}`, both)).status).toBe(400);
    expect(
      (await trainer.http.put(`/v1/programs/${copy.id}`, { ...input, workouts: [] })).status,
    ).toBe(400);

    // Another workspace's custom exercise is unknown here.
    const foreign = await other.http.post("/v1/exercises", {
      name: "Secret Move",
      category: "strength",
      muscleGroups: ["core"],
      equipment: ["bodyweight"],
      difficulty: "beginner",
    });
    const sneaky = structuredClone(input);
    at(at(sneaky.workouts, 0).exercises, 0).exerciseId = foreign.body.id;
    const refused = await trainer.http.put(`/v1/programs/${copy.id}`, sneaky);
    expect(refused.status).toBe(400);
    expect(refused.body.fieldErrors["workouts.0.exercises.0.exerciseId"]).toBeDefined();
  });

  it("duplicates, saves as template, archives and restores", async () => {
    const trainer = await signedInTrainer();
    const copy = await fromTemplate(trainer, "Upper/Lower 4×/week");
    const duplicate = await trainer.http.post("/v1/programs", { fromProgramId: copy.id });
    expect(duplicate.body.name).toBe("Upper/Lower 4×/week (copy)");
    const template = await trainer.http.post("/v1/programs", {
      fromProgramId: copy.id,
      name: "My upper/lower",
      asTemplate: true,
    });
    expect(template.body).toMatchObject({ isTemplate: true, global: false });
    expect(template.body.workouts).toHaveLength(4);

    const blank = await trainer.http.post("/v1/programs", {});
    expect(blank.body.workouts).toEqual([
      expect.objectContaining({ name: "Workout 1", dayNumber: 1, exercises: [] }),
    ]);

    const list = (await trainer.http.get("/v1/programs")).body.programs;
    expect(list).toHaveLength(4);
    await trainer.http.post(`/v1/programs/${blank.body.id}/archive`);
    expect((await trainer.http.get("/v1/programs")).body.programs).toHaveLength(3);
    expect((await trainer.http.get("/v1/programs?archived=true")).body.programs).toHaveLength(1);
    expect(
      (await trainer.http.put(`/v1/programs/${blank.body.id}`, toInput(blank.body))).status,
    ).toBe(409);
    expect((await trainer.http.post(`/v1/programs/${blank.body.id}/restore`)).body.archived).toBe(
      false,
    );
  });
});

describe("assignment and planned sessions", () => {
  it("assigns a copy with a schedule, plans the next four weeks and keeps a snapshot", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const program = await fromTemplate(trainer);
    const schedule = [
      { workoutIndex: 0, weekday: 2 },
      { workoutIndex: 1, weekday: 4 },
      { workoutIndex: 2, weekday: 6 },
    ];
    const key = randomUUID();
    const assign = () =>
      trainer.http
        .post(`/v1/programs/${program.id}/assign`, {
          clientId,
          startsOn: day(0),
          schedule,
          instructions: "Warm up for 5 minutes first.",
        })
        .set("Idempotency-Key", key);
    const assigned = await assign();
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
    expect(assigned.body.sessionsPlanned).toBeGreaterThanOrEqual(11);
    expect(assigned.body.assignment).toMatchObject({
      status: "active",
      startsOn: day(0),
    });
    expect(assigned.body.replaced).toBeNull();
    expect((await assign()).body.assignment.id).toBe(assigned.body.assignment.id);

    const workouts = (await trainer.http.get(`/v1/clients/${clientId}/workouts`)).body;
    expect(workouts.assignment.instructions).toBe("Warm up for 5 minutes first.");
    expect(workouts.upcoming.length).toBeGreaterThan(0);
    for (const session of workouts.upcoming) {
      expect(session.scheduledOn >= day(0) && session.scheduledOn <= day(27)).toBe(true);
      expect(isoWeekday(session.scheduledOn)).toBe(schedule[session.workoutIndex]?.weekday);
      expect(session.name).toBe(program.workouts[session.workoutIndex]?.name);
    }
    expect((await trainer.http.get(`/v1/programs/${program.id}`)).body.activeAssignments).toBe(1);

    // Editing the program later doesn't change what the client follows.
    await trainer.http.put(`/v1/programs/${program.id}`, { ...toInput(program), name: "Renamed" });
    const after = (await trainer.http.get(`/v1/clients/${clientId}/workouts`)).body;
    expect(after.assignment.name).toBe("Beginner Full Body 3×/week");
    expect(after.upcoming.map((s: { id: string }) => s.id)).toEqual(
      workouts.upcoming.map((s: { id: string }) => s.id),
    );
  });

  it("replaces the previous program, ends a program and ends it when the client is archived", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const first = await fromTemplate(trainer);
    const second = await fromTemplate(trainer, "Home Dumbbell 3×/week");
    const assign = (program: ProgramDetail) =>
      trainer.http
        .post(`/v1/programs/${program.id}/assign`, {
          clientId,
          startsOn: day(1),
          schedule: scheduleOf(program),
        })
        .set("Idempotency-Key", randomUUID());
    await assign(first);
    const replaced = await assign(second);
    expect(replaced.body.replaced).toBe("Beginner Full Body 3×/week");
    const { rows } = await owner.query<{ name: string; count: number }>(
      `select a.name, count(s.id)::int as count from client_program_assignments a
       left join workout_sessions s on s.assignment_id = a.id
       where a.client_id = $1 group by a.name, a.status order by a.name`,
      [clientId],
    );
    expect(rows.find((row) => row.name === "Beginner Full Body 3×/week")?.count).toBe(0);

    const ended = await trainer.http.post(`/v1/assignments/${replaced.body.assignment.id}/end`);
    expect(ended.body).toMatchObject({ upcoming: [], assignment: { status: "ended" } });
    expect(
      (await trainer.http.post(`/v1/assignments/${replaced.body.assignment.id}/end`)).status,
    ).toBe(409);

    await assign(first);
    await trainer.http.post(`/v1/clients/${clientId}/status`, { action: "archive" });
    const archived = (await trainer.http.get(`/v1/clients/${clientId}/workouts`)).body;
    expect(archived.assignment.status).toBe("ended");
    expect(archived.upcoming).toEqual([]);
  });

  it("refuses templates, empty workouts, missing days and inactive clients", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const template = await templateId(trainer, "Beginner Full Body 3×/week");
    const body = (schedule: object[]) => ({ clientId, startsOn: day(0), schedule });
    expect(
      (
        await trainer.http.post(
          `/v1/programs/${template}/assign`,
          body([{ workoutIndex: 0, weekday: 1 }]),
        )
      ).status,
    ).toBe(409);
    const blank = (await trainer.http.post("/v1/programs", {})).body;
    expect(
      (
        await trainer.http.post(
          `/v1/programs/${blank.id}/assign`,
          body([{ workoutIndex: 0, weekday: 1 }]),
        )
      ).status,
    ).toBe(409);
    const program = await fromTemplate(trainer);
    const missing = await trainer.http.post(
      `/v1/programs/${program.id}/assign`,
      body([{ workoutIndex: 0, weekday: 1 }]),
    );
    expect(missing.status).toBe(400);
    await trainer.http.post(`/v1/clients/${clientId}/status`, { action: "pause" });
    expect(
      (await trainer.http.post(`/v1/programs/${program.id}/assign`, body(scheduleOf(program))))
        .status,
    ).toBe(409);
  });

  it("rolls the window forward daily and completes programs that have ended", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const program = await fromTemplate(trainer);
    const { body } = await trainer.http
      .post(`/v1/programs/${program.id}/assign`, {
        clientId,
        startsOn: day(0),
        schedule: scheduleOf(program),
      })
      .set("Idempotency-Key", randomUUID());
    const id = body.assignment.id;
    const count = async () =>
      (
        await owner.query<{ n: number }>(
          "select count(*)::int as n from workout_sessions where assignment_id = $1",
          [id],
        )
      ).rows[0]?.n;
    const before = await count();
    await owner.query("delete from workout_sessions where assignment_id = $1", [id]);
    await app.get(AssignmentsService).extendWindows();
    expect(await count()).toBe(before);
    await app.get(AssignmentsService).extendWindows();
    expect(await count()).toBe(before);

    await owner.query(
      "update client_program_assignments set starts_on = $2, ends_on = $3 where id = $1",
      [id, day(-60), day(-1)],
    );
    await app.get(AssignmentsService).extendWindows();
    const workouts = (await trainer.http.get(`/v1/clients/${clientId}/workouts`)).body;
    expect(workouts.assignment.status).toBe("completed");
  });
});

describe("tampering", () => {
  it("never reaches another workspace's programs, assignments or client workouts", async () => {
    const owner = await signedInTrainer();
    const other = await signedInTrainer();
    const clientId = await newClient(owner);
    const program = await fromTemplate(owner);
    const { body } = await owner.http
      .post(`/v1/programs/${program.id}/assign`, {
        clientId,
        startsOn: day(0),
        schedule: scheduleOf(program),
      })
      .set("Idempotency-Key", randomUUID());

    expect((await other.http.get(`/v1/programs/${program.id}`)).status).toBe(404);
    expect((await other.http.put(`/v1/programs/${program.id}`, toInput(program))).status).toBe(404);
    expect((await other.http.post("/v1/programs", { fromProgramId: program.id })).status).toBe(404);
    expect((await other.http.post(`/v1/programs/${program.id}/archive`)).status).toBe(404);
    const otherProgram = await fromTemplate(other);
    const foreignClient = await other.http.post(`/v1/programs/${otherProgram.id}/assign`, {
      clientId,
      startsOn: day(0),
      schedule: scheduleOf(otherProgram),
    });
    expect(foreignClient.status).toBe(400);
    expect((await other.http.get(`/v1/clients/${clientId}/workouts`)).status).toBe(404);
    expect((await other.http.post(`/v1/assignments/${body.assignment.id}/end`)).status).toBe(404);
    expect((await owner.http.get(`/v1/clients/${clientId}/workouts`)).body.assignment.status).toBe(
      "active",
    );
  });
});
