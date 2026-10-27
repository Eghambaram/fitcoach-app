import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { ProgramDetail, WorkoutDetail, WorkoutExercise } from "@fitcoach/shared";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";

let app: INestApplication;
let system: Pool;
const { signedInTrainer } = createHttpHelpers(
  () => app,
  () => system,
);
type SignedIn = Awaited<ReturnType<typeof signedInTrainer>>;

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
});

afterAll(async () => {
  await app.close();
  await system.end();
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
/** Local date and HH:MM in the workspace zone, `minutes` from now. */
function localIn(minutes: number): { date: string; startTime: string } {
  const at = new Date(Date.now() + minutes * 60_000);
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(at),
    startTime: new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(at),
  };
}

/** items[index], or a test failure. */
function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`nothing at index ${index}`);
  return item;
}

let counter = 0;
async function newClient(trainer: SignedIn): Promise<string> {
  const response = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName: "Asha Rao",
      phone: `95${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`,
      primaryGoal: "build_muscle",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    })
    .set("Idempotency-Key", randomUUID());
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.clientId;
}

/** A client following Beginner Full Body, with its first workout planned for today. */
async function todaysWorkout(trainer: SignedIn, clientId: string): Promise<string> {
  const templates = await trainer.http.get("/v1/programs/templates");
  const template = templates.body.templates.find(
    (t: { name: string }) => t.name === "Beginner Full Body 3×/week",
  );
  const copy = await trainer.http.post("/v1/programs", { fromProgramId: template.id });
  const program = copy.body as ProgramDetail;
  const today = isoWeekday(day(0));
  const others = [1, 2, 3, 4, 5, 6, 7].filter((value) => value !== today);
  const assigned = await trainer.http
    .post(`/v1/programs/${program.id}/assign`, {
      clientId,
      startsOn: day(0),
      schedule: program.workouts.map((_, workoutIndex) => ({
        workoutIndex,
        weekday: workoutIndex === 0 ? today : at(others, workoutIndex),
      })),
    })
    .set("Idempotency-Key", randomUUID());
  expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
  const workouts = await trainer.http.get(`/v1/clients/${clientId}/workouts`);
  const session = workouts.body.upcoming.find(
    (s: { scheduledOn: string; workoutIndex: number }) =>
      s.scheduledOn === day(0) && s.workoutIndex === 0,
  );
  expect(session).toBeDefined();
  return session.id;
}

const putSet = (
  trainer: SignedIn,
  id: string,
  item: WorkoutExercise,
  setNumber: number,
  extra: Record<string, unknown> = {},
) =>
  trainer.http.put(`/v1/workout-sets/${id}`, {
    sessionExerciseId: item.id,
    setNumber,
    reps: 10,
    loadKg: 20,
    durationSeconds: null,
    rpe: null,
    completed: true,
    ...extra,
  });

describe("live workout logging", () => {
  it("logs a full workout, survives repeats and refreshes, and uses the package once", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const sold = await trainer.http
      .post(`/v1/clients/${clientId}/packages`, {
        name: "12 sessions",
        kind: "session_pack",
        sessionsIncluded: 12,
        sessionsPerWeek: null,
        startsOn: day(-1),
        expiresOn: day(60),
        pricePaise: 1_200_000,
        amountDuePaise: 0,
        paymentDueOn: null,
      })
      .set("Idempotency-Key", randomUUID());
    expect(sold.status, JSON.stringify(sold.body)).toBe(200);
    const appointment = await trainer.http.post("/v1/appointments", {
      clientId,
      kind: "session",
      ...localIn(-2),
      durationMin: 60,
    });
    expect(appointment.status, JSON.stringify(appointment.body)).toBe(201);
    const sessionId = await todaysWorkout(trainer, clientId);

    // Opening it changes nothing; it previews the program's exercises.
    const preview = await trainer.http.get(`/v1/workout-sessions/${sessionId}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ status: "planned", startedAt: null, appointment: null });
    expect(preview.body.exercises.length).toBeGreaterThan(1);
    expect(preview.body.exercises.every((item: WorkoutExercise) => item.id === null)).toBe(true);
    expect((await trainer.http.get(`/v1/workout-sessions/${sessionId}`)).body.status).toBe(
      "planned",
    );
    expect((await trainer.http.post(`/v1/workout-sessions/${sessionId}/finish`, {})).status).toBe(
      409,
    );

    const started = await trainer.http.post(`/v1/workout-sessions/${sessionId}/start`);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const workout = started.body as WorkoutDetail;
    expect(workout.status).toBe("in_progress");
    expect(workout.appointment).toMatchObject({ id: appointment.body.id, started: true });
    expect(workout.exercises.map((item) => item.exercise.id)).toEqual(
      preview.body.exercises.map((item: WorkoutExercise) => item.exercise.id),
    );
    expect(workout.summary).toMatchObject({ exercisesDone: 0, setsCompleted: 0 });
    // Starting twice (double tap, retry) returns the same workout.
    const again = await trainer.http.post(`/v1/workout-sessions/${sessionId}/start`);
    expect(again.body.exercises.map((item: WorkoutExercise) => item.id)).toEqual(
      workout.exercises.map((item) => item.id),
    );

    const first = at(workout.exercises, 0);
    const setId = randomUUID();
    const saved = await putSet(trainer, setId, first, 1);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const savedSet = at(at((saved.body as WorkoutDetail).exercises, 0).logged, 0);
    expect(savedSet).toMatchObject({ id: setId, reps: 10, loadKg: 20, completed: true });
    // The same request again (lost response) is a no-op.
    const repeat = await putSet(trainer, setId, first, 1);
    expect(at(repeat.body.exercises as WorkoutExercise[], 0).logged).toEqual([savedSet]);
    // A refresh lost the id: the set with that number is updated, not duplicated.
    const lostId = await putSet(trainer, randomUUID(), first, 1, { reps: 12 });
    const afterLost = at(lostId.body.exercises as WorkoutExercise[], 0).logged;
    expect(afterLost).toHaveLength(1);
    expect(at(afterLost, 0)).toMatchObject({ id: setId, reps: 12 });
    // Sets can't skip ahead, and a completed set needs reps or a time.
    expect((await putSet(trainer, randomUUID(), first, first.sets + 2)).status).toBe(400);
    expect(
      (await putSet(trainer, randomUUID(), first, 2, { reps: null, durationSeconds: null })).status,
    ).toBe(400);

    for (let setNumber = 2; setNumber <= first.sets; setNumber += 1) {
      expect((await putSet(trainer, randomUUID(), first, setNumber)).status).toBe(200);
    }
    // Refresh: everything comes back from the API.
    const restored = (await trainer.http.get(`/v1/workout-sessions/${sessionId}`))
      .body as WorkoutDetail;
    expect(at(restored.exercises, 0)).toMatchObject({ done: true });
    expect(at(restored.exercises, 0).logged).toHaveLength(first.sets);
    expect(restored.summary).toMatchObject({ exercisesDone: 1, setsCompleted: first.sets });
    expect(restored.summary.volumeKg).toBe(12 * 20 + (first.sets - 1) * 10 * 20);

    // Substitute the second exercise and add one at the end.
    const second = at(restored.exercises, 1);
    const library = await trainer.http.get("/v1/exercises");
    const replacement =
      second.substitutions[0]?.id ??
      library.body.exercises.find(
        (item: { id: string }) =>
          !restored.exercises.some((logged) => logged.exercise.id === item.id),
      ).id;
    const swapped = await trainer.http.post(
      `/v1/workout-session-exercises/${second.id}/substitute`,
      { exerciseId: replacement },
    );
    expect(swapped.status, JSON.stringify(swapped.body)).toBe(200);
    expect(at(swapped.body.exercises as WorkoutExercise[], 1)).toMatchObject({
      exercise: { id: replacement },
      substitutedFor: { id: second.exercise.id },
    });
    const added = await trainer.http.post(`/v1/workout-sessions/${sessionId}/exercises`, {
      exerciseId: second.exercise.id,
      sets: 2,
      repsMin: 8,
      repsMax: 12,
      durationSeconds: null,
      targetLoadKg: null,
      restSeconds: 60,
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect((added.body as WorkoutDetail).exercises.at(-1)).toMatchObject({
      added: true,
      exercise: { id: second.exercise.id },
    });

    const key = randomUUID();
    const finished = await trainer.http
      .post(`/v1/workout-sessions/${sessionId}/finish`, { feedback: "Strong session." })
      .set("Idempotency-Key", key);
    expect(finished.status, JSON.stringify(finished.body)).toBe(200);
    expect(finished.body).toMatchObject({ status: "completed", feedback: "Strong session." });
    expect(finished.body.appointment).toMatchObject({ status: "scheduled", started: true });
    const replay = await trainer.http
      .post(`/v1/workout-sessions/${sessionId}/finish`, { feedback: "Strong session." })
      .set("Idempotency-Key", key);
    expect(replay.body.completedAt).toBe(finished.body.completedAt);
    // Finished workouts are history.
    expect((await putSet(trainer, randomUUID(), first, 1, { reps: 1 })).status).toBe(409);
    expect((await trainer.http.post(`/v1/workout-sessions/${sessionId}/skip`, {})).status).toBe(
      409,
    );

    // "Mark attended" from the summary uses one package session, however often it is sent.
    for (let i = 0; i < 2; i += 1) {
      const marked = await trainer.http.post(`/v1/appointments/${appointment.body.id}/attendance`, {
        status: "completed",
      });
      expect(marked.status).toBe(200);
    }
    const packages = await trainer.http.get(`/v1/clients/${clientId}/packages`);
    expect(packages.body.active).toMatchObject({ sessionsUsed: 1, sessionsLeft: 11 });
    const recent = await trainer.http.get(`/v1/clients/${clientId}/workouts`);
    expect(recent.body.recent).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: sessionId, status: "completed" })]),
    );
  });

  it("refuses to finish with nothing done, and skips a planned workout", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const sessionId = await todaysWorkout(trainer, clientId);
    await trainer.http.post(`/v1/workout-sessions/${sessionId}/start`);
    const empty = await trainer.http.post(`/v1/workout-sessions/${sessionId}/finish`, {});
    expect(empty.status).toBe(409);
    expect(empty.body.message).toMatch(/skip/i);
    const skipped = await trainer.http.post(`/v1/workout-sessions/${sessionId}/skip`, {
      reason: "Client unwell",
    });
    expect(skipped.body).toMatchObject({ status: "skipped", skipReason: "Client unwell" });
    expect((await trainer.http.post(`/v1/workout-sessions/${sessionId}/start`)).status).toBe(409);
  });

  it("never lets another workspace read or change a workout (tampering)", async () => {
    const a = await signedInTrainer();
    const b = await signedInTrainer();
    const clientId = await newClient(a);
    const sessionId = await todaysWorkout(a, clientId);
    const workout = (await a.http.post(`/v1/workout-sessions/${sessionId}/start`))
      .body as WorkoutDetail;
    const first = at(workout.exercises, 0);
    const setId = randomUUID();
    await putSet(a, setId, first, 1);

    expect((await b.http.get(`/v1/workout-sessions/${sessionId}`)).status).toBe(404);
    expect((await b.http.post(`/v1/workout-sessions/${sessionId}/finish`, {})).status).toBe(404);
    expect((await b.http.post(`/v1/workout-sessions/${sessionId}/skip`, {})).status).toBe(404);
    expect((await putSet(b, setId, first, 1, { reps: 99 })).status).toBe(404);
    expect(
      (
        await b.http.post(`/v1/workout-session-exercises/${first.id}/substitute`, {
          exerciseId: first.exercise.id,
        })
      ).status,
    ).toBe(404);
    const after = (await a.http.get(`/v1/workout-sessions/${sessionId}`)).body as WorkoutDetail;
    expect(at(at(after.exercises, 0).logged, 0)).toMatchObject({ id: setId, reps: 10 });
    expect(after.status).toBe("in_progress");
  });
});
