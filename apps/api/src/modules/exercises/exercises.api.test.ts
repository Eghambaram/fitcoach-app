import type { INestApplication } from "@nestjs/common";
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

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
});

afterAll(async () => {
  await app.close();
  await system.end();
});

const custom = {
  name: "Landmine Press",
  category: "strength",
  muscleGroups: ["shoulders", "chest"],
  equipment: ["barbell"],
  difficulty: "intermediate",
  instructions: "Press the end of the bar up and forward from your shoulder.",
  mediaUrl: "https://videos.example.test/landmine",
};

type Item = { id: string; name: string; custom: boolean; muscleGroups: string[] };
const names = (body: { exercises: Item[] }) => body.exercises.map((exercise) => exercise.name);

describe("exercise library", () => {
  it("lists ~100 library exercises, searchable and filterable, with substitutions", async () => {
    const trainer = await signedInTrainer();
    const all = await trainer.http.get("/v1/exercises");
    expect(all.status).toBe(200);
    expect(all.body.totals).toEqual({ library: all.body.exercises.length, custom: 0 });
    expect(all.body.exercises.length).toBeGreaterThanOrEqual(100);

    const squat = await trainer.http.get("/v1/exercises?q=squat");
    expect(names(squat.body)).toContain("Goblet Squat");
    expect(names(squat.body).every((name: string) => /squat/i.test(name))).toBe(true);

    const bands = await trainer.http.get("/v1/exercises?equipment=band&muscle=back");
    expect(bands.body.exercises.length).toBeGreaterThan(0);
    for (const exercise of bands.body.exercises) {
      expect(exercise.equipment).toContain("band");
      expect(exercise.muscleGroups).toContain("back");
    }
    const mobility = await trainer.http.get("/v1/exercises?category=mobility");
    expect(names(mobility.body)).toContain("Cat-Cow");

    const goblet = squat.body.exercises.find((e: Item) => e.name === "Goblet Squat");
    const detail = await trainer.http.get(`/v1/exercises/${goblet.id}`);
    expect(detail.body).toMatchObject({ custom: false, mediaUrl: null });
    expect(detail.body.substitutions.map((s: { name: string }) => s.name)).toEqual([
      "Bodyweight Squat",
      "Barbell Back Squat",
    ]);
    expect((await trainer.http.get("/v1/exercises?muscle=wings")).status).toBe(400);
  });

  it("adds, edits, archives and restores a custom exercise; the library stays read-only", async () => {
    const trainer = await signedInTrainer();
    const created = await trainer.http.post("/v1/exercises", custom);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ name: "Landmine Press", custom: true, archived: false });

    const duplicate = await trainer.http.post("/v1/exercises", {
      ...custom,
      name: "landmine press",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.fieldErrors.name).toBeDefined();
    expect((await trainer.http.post("/v1/exercises", { ...custom, muscleGroups: [] })).status).toBe(
      400,
    );
    expect(
      (
        await trainer.http.post("/v1/exercises", {
          ...custom,
          name: "X",
          mediaUrl: "http://x.test",
        })
      ).status,
    ).toBe(400);

    const id = created.body.id;
    const edited = await trainer.http.put(`/v1/exercises/${id}`, {
      ...custom,
      difficulty: "advanced",
    });
    expect(edited.body.difficulty).toBe("advanced");

    const mine = await trainer.http.get("/v1/exercises?source=custom");
    expect(names(mine.body)).toEqual(["Landmine Press"]);
    expect((await trainer.http.get("/v1/exercises?q=landmine")).body.exercises).toHaveLength(1);

    expect((await trainer.http.post(`/v1/exercises/${id}/archive`)).body.archived).toBe(true);
    expect((await trainer.http.get("/v1/exercises?source=custom")).body.exercises).toHaveLength(0);
    expect(
      names((await trainer.http.get("/v1/exercises?source=custom&archived=true")).body),
    ).toEqual(["Landmine Press"]);
    expect((await trainer.http.put(`/v1/exercises/${id}`, custom)).status).toBe(409);
    expect((await trainer.http.post(`/v1/exercises/${id}/restore`)).body.archived).toBe(false);

    const library = (await trainer.http.get("/v1/exercises?q=plank&source=library")).body
      .exercises[0];
    const locked = await trainer.http.put(`/v1/exercises/${library.id}`, custom);
    expect(locked.status).toBe(403);
    expect((await trainer.http.post(`/v1/exercises/${library.id}/archive`)).status).toBe(403);
  });

  it("never shows or changes another workspace's custom exercises (tampering)", async () => {
    const owner = await signedInTrainer();
    const other = await signedInTrainer();
    const { body } = await owner.http.post("/v1/exercises", custom);
    expect((await other.http.get(`/v1/exercises/${body.id}`)).status).toBe(404);
    expect((await other.http.put(`/v1/exercises/${body.id}`, custom)).status).toBe(404);
    expect((await other.http.post(`/v1/exercises/${body.id}/archive`)).status).toBe(404);
    expect(names((await other.http.get("/v1/exercises?q=landmine")).body)).toEqual([]);
    expect((await owner.http.get(`/v1/exercises/${body.id}`)).body.archived).toBe(false);
  });
});

describe("starter program templates", () => {
  it("returns the 7 templates with workouts and library exercises only", async () => {
    const trainer = await signedInTrainer();
    const response = await trainer.http.get("/v1/programs/templates");
    expect(response.status).toBe(200);
    const templates = response.body.templates as {
      name: string;
      daysPerWeek: number;
      description: string;
      workouts: { exercises: { exercise: { id: string } }[] }[];
    }[];
    expect(templates.map((t) => t.name)).toEqual([
      "Beginner Full Body 3×/week",
      "Fat Loss Circuit 4×/week",
      "Upper/Lower 4×/week",
      "Push/Pull/Legs 6×/week",
      "Home Dumbbell 3×/week",
      "Mobility & Recovery 2×/week",
      "Online Coaching Starter 3×/week",
    ]);
    const library = new Set(
      ((await trainer.http.get("/v1/exercises?source=library")).body.exercises as Item[]).map(
        (e) => e.id,
      ),
    );
    for (const template of templates) {
      expect(template.workouts).toHaveLength(template.daysPerWeek);
      // No outcome claims in descriptions.
      expect(template.description).not.toMatch(/guarantee|results|lose \d|burn|transform/i);
      for (const workout of template.workouts) {
        expect(workout.exercises.length).toBeGreaterThan(0);
        for (const item of workout.exercises) expect(library.has(item.exercise.id)).toBe(true);
      }
    }
  });
});
