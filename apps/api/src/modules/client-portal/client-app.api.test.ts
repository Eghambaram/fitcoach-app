import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type {
  ClientWorkoutResponse,
  CreateInviteResponse,
  ProgramDetail,
  WorkoutDetail,
} from "@fitcoach/shared";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";

let app: INestApplication;
let system: Pool;
const { client, signedInTrainer } = createHttpHelpers(
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
const local = (minutes: number) => {
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
};

let counter = 0;
/** A trainer, an active client with a program (workout 0 today), a package and a session, signed in on a phone. */
async function setUp() {
  const trainer = await signedInTrainer();
  const onboarded = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName: "Asha Rao",
      phone: `97${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`,
      primaryGoal: "build_muscle",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    })
    .set("Idempotency-Key", randomUUID());
  expect(onboarded.status, JSON.stringify(onboarded.body)).toBe(201);
  const clientId: string = onboarded.body.clientId;

  const templates = await trainer.http.get("/v1/programs/templates");
  const template = templates.body.templates.find(
    (t: { name: string }) => t.name === "Beginner Full Body 3×/week",
  );
  const program = (await trainer.http.post("/v1/programs", { fromProgramId: template.id }))
    .body as ProgramDetail;
  // A trainer-only note that must never reach the client.
  const saved = await trainer.http.put(`/v1/programs/${program.id}`, {
    name: program.name,
    goal: program.goal,
    durationWeeks: program.durationWeeks,
    workouts: program.workouts.map((workout, index) => ({
      name: workout.name,
      dayNumber: workout.dayNumber,
      notes: index === 0 ? "Warm up well." : undefined,
      exercises: workout.exercises.map((item, position) => ({
        exerciseId: item.exercise.id,
        sets: item.sets,
        repsMin: item.repsMin,
        repsMax: item.repsMax,
        durationSeconds: item.durationSeconds,
        targetLoadKg: item.targetLoadKg,
        restSeconds: item.restSeconds,
        trainerNotes: position === 0 ? "SECRET knee history" : undefined,
        clientInstructions: position === 0 ? "Keep your chest up." : undefined,
      })),
    })),
  });
  expect(saved.status, JSON.stringify(saved.body)).toBe(200);
  const today = isoWeekday(day(0));
  const others = [1, 2, 3, 4, 5, 6, 7].filter((value) => value !== today);
  const assigned = await trainer.http
    .post(`/v1/programs/${program.id}/assign`, {
      clientId,
      startsOn: day(0),
      schedule: program.workouts.map((_, workoutIndex) => ({
        workoutIndex,
        weekday: workoutIndex === 0 ? today : others[workoutIndex],
      })),
    })
    .set("Idempotency-Key", randomUUID());
  expect(assigned.status, JSON.stringify(assigned.body)).toBe(200);
  await trainer.http
    .post(`/v1/clients/${clientId}/packages`, {
      name: "12 sessions",
      kind: "session_pack",
      sessionsIncluded: 12,
      sessionsPerWeek: null,
      startsOn: day(-1),
      expiresOn: day(60),
      pricePaise: 1_234_500,
      amountDuePaise: 1_234_500,
      paymentDueOn: null,
    })
    .set("Idempotency-Key", randomUUID());
  const appointment = await trainer.http.post("/v1/appointments", {
    clientId,
    kind: "session",
    ...local(120),
    durationMin: 60,
    location: "Studio 2",
  });
  expect(appointment.status, JSON.stringify(appointment.body)).toBe(201);
  await trainer.http.put(`/v1/appointments/${appointment.body.id}/notes`, {
    notes: "SECRET session note",
  });

  const invite = (
    await trainer.http.post(`/v1/clients/${clientId}/portal/invite`, { channel: "whatsapp" })
  ).body as CreateInviteResponse;
  const phone = client();
  const accepted = await phone.post("/v1/client-auth/invite/accept", {
    token: invite.link.split("/invite/")[1],
    acceptTerms: true,
  });
  expect(accepted.status).toBe(200);
  return { trainer, clientId, phone };
}

async function setSelfLogging(trainer: SignedIn, clientId: string, on: boolean) {
  const response = await trainer.http.put(`/v1/clients/${clientId}/portal/features`, {
    workoutSelfLogging: on,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body.features.workoutSelfLogging).toBe(on);
}

describe("client app", () => {
  it("shows home, workouts, schedule and profile from the client's own data only", async () => {
    const { phone } = await setUp();

    const home = await phone.get("/v1/client/home");
    expect(home.status, JSON.stringify(home.body)).toBe(200);
    expect(home.body.today).toBe(day(0));
    expect(home.body.week).toHaveLength(7);
    expect(home.body.todayWorkout).toMatchObject({ name: "Full Body A", status: "planned" });
    expect(home.body.nextSession).toMatchObject({ kind: "session", location: "Studio 2" });
    expect(home.body.package).toEqual({
      name: "12 sessions",
      kind: "session_pack",
      sessionsLeft: 12,
      sessionsIncluded: 12,
      expiresOn: day(60),
    });
    expect(home.body.programName).toBe("Beginner Full Body 3×/week");
    const text = JSON.stringify(home.body);
    expect(text).not.toMatch(/1234500|SECRET|price|amountDue|notes/i);

    const list = await phone.get("/v1/client/workouts");
    expect(list.body.upcoming[0]).toMatchObject({ name: "Full Body A", scheduledOn: day(0) });

    const detail = await phone.get(`/v1/client/workouts/${home.body.todayWorkout.id}`);
    const workout = (detail.body as ClientWorkoutResponse).workout;
    expect(detail.body.canLog).toBe(false);
    expect(workout.program.notes).toBe("Warm up well.");
    expect(workout.exercises[0]).toMatchObject({
      trainerNotes: null,
      clientInstructions: "Keep your chest up.",
    });
    expect(JSON.stringify(detail.body)).not.toContain("SECRET");
    expect(workout.summary.estimatedMinutes).toBeGreaterThan(0);

    const schedule = await phone.get("/v1/client/schedule");
    expect(schedule.body.upcoming).toHaveLength(1);
    expect(JSON.stringify(schedule.body)).not.toMatch(/SECRET|notes/);

    const profile = await phone.get("/v1/client/profile");
    expect(profile.body).toMatchObject({
      fullName: "Asha Rao",
      units: { weightUnit: "kg", lengthUnit: "cm" },
      goals: [{ goal: "build_muscle", primary: true }],
    });
    const updated = await phone.put("/v1/client/profile/preferences", {
      preferredContact: "whatsapp",
      weightUnit: "lb",
      lengthUnit: "in",
    });
    expect(updated.body).toMatchObject({
      preferredContact: "whatsapp",
      units: { weightUnit: "lb", lengthUnit: "in" },
    });
    expect(
      (
        await phone.put("/v1/client/profile/preferences", {
          preferredContact: null,
          weightUnit: "stone",
          lengthUnit: "in",
        })
      ).status,
    ).toBe(400);
  });

  it("logs a workout only when the trainer turned self-logging on", async () => {
    const { trainer, clientId, phone } = await setUp();
    const home = await phone.get("/v1/client/home");
    const id: string = home.body.todayWorkout.id;
    expect((await phone.post(`/v1/client/workouts/${id}/start`)).status).toBe(403);
    expect((await phone.get(`/v1/client/workouts/${id}`)).body.workout.status).toBe("planned");

    await setSelfLogging(trainer, clientId, true);
    expect((await phone.get("/v1/client/me")).body.features.workoutSelfLogging).toBe(true);
    const started = await phone.post(`/v1/client/workouts/${id}/start`);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const workout = (started.body as ClientWorkoutResponse).workout;
    expect(started.body.canLog).toBe(true);
    expect(workout.appointment).toBeNull();
    const first = workout.exercises[0];
    const setId = randomUUID();
    const put = (body: Record<string, unknown> = {}) =>
      phone.put(`/v1/client/workout-sets/${setId}`, {
        sessionExerciseId: first?.id,
        setNumber: 1,
        reps: 10,
        loadKg: 12.5,
        durationSeconds: null,
        rpe: 7,
        completed: true,
        ...body,
      });
    expect((await put()).status).toBe(200);
    expect((await put()).body.workout.exercises[0].logged).toHaveLength(1);
    // Trainer-only actions stay trainer-only.
    expect((await phone.post(`/v1/workout-sessions/${id}/skip`, {})).status).toBe(403);
    expect((await phone.get(`/v1/workout-sessions/${id}`)).status).toBe(403);

    const finished = await phone
      .post(`/v1/client/workouts/${id}/finish`, { feedback: "Felt strong" })
      .set("Idempotency-Key", randomUUID());
    expect(finished.status, JSON.stringify(finished.body)).toBe(200);
    expect(finished.body.workout).toMatchObject({
      status: "completed",
      clientFeedback: "Felt strong",
      feedback: null,
    });
    expect(finished.body.canLog).toBe(false);

    // The trainer sees what the client logged, and their own feedback stays theirs.
    const trainerView = (await trainer.http.get(`/v1/workout-sessions/${id}`))
      .body as WorkoutDetail;
    expect(trainerView).toMatchObject({ status: "completed", clientFeedback: "Felt strong" });
    expect(trainerView.exercises[0]?.logged[0]).toMatchObject({
      id: setId,
      reps: 10,
      loadKg: 12.5,
    });

    await setSelfLogging(trainer, clientId, false);
    const next = (await phone.get("/v1/client/workouts")).body.upcoming[0];
    expect((await phone.post(`/v1/client/workouts/${next.id}/start`)).status).toBe(403);
  });

  it("keeps clients to their own workouts and trainers to their own clients (tampering)", async () => {
    const one = await setUp();
    const two = await setUp();
    const theirs = (await two.phone.get("/v1/client/home")).body.todayWorkout.id;
    await setSelfLogging(one.trainer, one.clientId, true);
    expect((await one.phone.get(`/v1/client/workouts/${theirs}`)).status).toBe(404);
    expect((await one.phone.post(`/v1/client/workouts/${theirs}/start`)).status).toBe(404);
    expect(
      (
        await one.trainer.http.put(`/v1/clients/${two.clientId}/portal/features`, {
          workoutSelfLogging: true,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await one.phone.put(`/v1/clients/${one.clientId}/portal/features`, {
          workoutSelfLogging: true,
        })
      ).status,
    ).toBe(403);
    expect((await two.trainer.http.get("/v1/client/home")).status).toBe(403);
  });
});
