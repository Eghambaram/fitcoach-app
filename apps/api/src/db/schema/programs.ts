import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./columns";
import { users } from "./identity";
import { workspaces } from "./workspaces";

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(", "));
const CATEGORIES = ["strength", "cardio", "plyometric", "mobility"];
const MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
  "hips",
  "full_body",
];
const EQUIPMENT = [
  "bodyweight",
  "barbell",
  "dumbbell",
  "kettlebell",
  "band",
  "cable",
  "machine",
  "bench",
  "pull_up_bar",
  "box",
  "cardio_machine",
  "mat",
];

/**
 * Exercise library (PROMPT §8.5, D21). `workspace_id NULL` = the global seed (read-only, shipped by
 * migration 0024); otherwise a workspace's custom exercise. Custom exercises are archived, never
 * deleted, because programs and logged sets point at them.
 */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    muscleGroups: text("muscle_groups").array().notNull(),
    equipment: text("equipment").array().notNull(),
    difficulty: text("difficulty").notNull().default("beginner"),
    instructions: text("instructions"),
    safetyNotes: text("safety_notes"),
    /** A licensed external link (uploads are v1.1). Seeded exercises have none. */
    mediaUrl: text("media_url"),
    /** Library exercises that train the same pattern (ids; no FK on arrays, checked by the seed). */
    substitutionIds: uuid("substitution_ids")
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    unique("exercises_workspace_id_id_key").on(t.workspaceId, t.id),
    uniqueIndex("exercises_workspace_name_key")
      .on(t.workspaceId, sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
    index("exercises_created_by_user_id_idx").on(t.createdByUserId),
    check("exercises_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check("exercises_category", sql`${t.category} in (${inList(CATEGORIES)})`),
    check(
      "exercises_muscle_groups",
      sql`cardinality(${t.muscleGroups}) between 1 and 6 and ${t.muscleGroups} <@ array[${inList(MUSCLES)}]::text[]`,
    ),
    check(
      "exercises_equipment",
      sql`cardinality(${t.equipment}) between 1 and 5 and ${t.equipment} <@ array[${inList(EQUIPMENT)}]::text[]`,
    ),
    check("exercises_difficulty", sql`${t.difficulty} in ('beginner', 'intermediate', 'advanced')`),
    check("exercises_instructions_length", sql`char_length(${t.instructions}) <= 1500`),
    check("exercises_safety_notes_length", sql`char_length(${t.safetyNotes}) <= 600`),
    check(
      "exercises_media_url",
      sql`${t.mediaUrl} is null or (${t.mediaUrl} like 'https://%' and char_length(${t.mediaUrl}) <= 500)`,
    ),
    check(
      "exercises_global_not_archived",
      sql`${t.workspaceId} is not null or ${t.archivedAt} is null`,
    ),
  ],
);

/**
 * Programs (PROMPT §8.5). `workspace_id NULL` + `is_template` = a global starter template (read-only,
 * copy-to-edit). The builder (step 3.4) adds a workspace's own programs.
 */
export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    goal: text("goal"),
    durationWeeks: smallint("duration_weeks").notNull(),
    daysPerWeek: smallint("days_per_week").notNull(),
    isTemplate: boolean("is_template").notNull().default(false),
    /** The template or program this one was copied from. */
    sourceProgramId: uuid("source_program_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    unique("programs_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "programs_source_program_fk",
      columns: [t.sourceProgramId],
      foreignColumns: [t.id],
    }).onDelete("set null"),
    index("programs_workspace_id_idx").on(t.workspaceId),
    index("programs_source_program_id_idx").on(t.sourceProgramId),
    index("programs_created_by_user_id_idx").on(t.createdByUserId),
    check("programs_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check("programs_description_length", sql`char_length(${t.description}) <= 1000`),
    check(
      "programs_goal",
      sql`${t.goal} is null or ${t.goal} in ('lose_weight', 'build_muscle', 'get_stronger', 'improve_fitness', 'sports_performance', 'other')`,
    ),
    check("programs_duration_weeks", sql`${t.durationWeeks} between 1 and 52`),
    check("programs_days_per_week", sql`${t.daysPerWeek} between 1 and 7`),
    check("programs_global_is_template", sql`${t.workspaceId} is not null or ${t.isTemplate}`),
  ],
);

/**
 * A program's workouts (one per day slot). The simple FK covers global rows (a composite FK with a
 * NULL workspace_id isn't checked); the composite FK keeps tenant rows inside their workspace.
 */
export const programWorkouts = pgTable(
  "program_workouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Day slot in the week, 1–7 (not a weekday). */
    dayNumber: smallint("day_number").notNull(),
    position: smallint("position").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    unique("program_workouts_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "program_workouts_program_fk",
      columns: [t.workspaceId, t.programId],
      foreignColumns: [programs.workspaceId, programs.id],
    }).onDelete("cascade"),
    unique("program_workouts_position_key").on(t.programId, t.position),
    index("program_workouts_workspace_id_idx").on(t.workspaceId),
    check("program_workouts_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check("program_workouts_day_number", sql`${t.dayNumber} between 1 and 7`),
    check("program_workouts_position", sql`${t.position} >= 1`),
    check("program_workouts_notes_length", sql`char_length(${t.notes}) <= 1000`),
  ],
);

/** Ordered exercises in a workout with their targets (tempo and progression are v1.1). */
export const programExercises = pgTable(
  "program_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    programWorkoutId: uuid("program_workout_id")
      .notNull()
      .references(() => programWorkouts.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    position: smallint("position").notNull(),
    sets: smallint("sets").notNull(),
    repsMin: smallint("reps_min"),
    repsMax: smallint("reps_max"),
    durationSeconds: integer("duration_seconds"),
    targetLoadKg: numeric("target_load_kg", { precision: 6, scale: 2, mode: "number" }),
    restSeconds: smallint("rest_seconds"),
    trainerNotes: text("trainer_notes"),
    clientInstructions: text("client_instructions"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "program_exercises_workout_fk",
      columns: [t.workspaceId, t.programWorkoutId],
      foreignColumns: [programWorkouts.workspaceId, programWorkouts.id],
    }).onDelete("cascade"),
    unique("program_exercises_position_key").on(t.programWorkoutId, t.position),
    index("program_exercises_workspace_id_idx").on(t.workspaceId),
    index("program_exercises_exercise_id_idx").on(t.exerciseId),
    check("program_exercises_position", sql`${t.position} >= 1`),
    check("program_exercises_sets", sql`${t.sets} between 1 and 20`),
    check(
      "program_exercises_target",
      sql`(${t.durationSeconds} is not null and ${t.repsMin} is null and ${t.repsMax} is null)
        or (${t.durationSeconds} is null and ${t.repsMin} is not null)`,
    ),
    check(
      "program_exercises_reps",
      sql`${t.repsMin} is null or (${t.repsMin} between 1 and 100 and coalesce(${t.repsMax}, ${t.repsMin}) between ${t.repsMin} and 100)`,
    ),
    check(
      "program_exercises_duration",
      sql`${t.durationSeconds} is null or ${t.durationSeconds} between 5 and 7200`,
    ),
    check(
      "program_exercises_load",
      sql`${t.targetLoadKg} is null or ${t.targetLoadKg} between 0 and 1000`,
    ),
    check(
      "program_exercises_rest",
      sql`${t.restSeconds} is null or ${t.restSeconds} between 0 and 900`,
    ),
    check("program_exercises_trainer_notes_length", sql`char_length(${t.trainerNotes}) <= 500`),
    check(
      "program_exercises_client_instructions_length",
      sql`char_length(${t.clientInstructions}) <= 500`,
    ),
  ],
);
