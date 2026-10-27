import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { timestamps } from "./columns";
import { users } from "./identity";
import { appointments } from "./scheduling";
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
    /** Weekday slot: 1 = Monday … 7 = Sunday (ADR-0053). */
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

/**
 * A program assigned to a client (PROMPT §8.5). `program_snapshot` is a copy taken at assignment, so
 * editing the program later never changes what the client follows. One active assignment per client.
 * `schedule` is `[{ workout_index, weekday, name }]`, used to generate planned sessions.
 */
export const clientProgramAssignments = pgTable(
  "client_program_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    programSnapshot: jsonb("program_snapshot").notNull(),
    schedule: jsonb("schedule").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    status: text("status").notNull().default("active"),
    instructions: text("instructions"),
    equipmentNotes: text("equipment_notes"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    unique("client_program_assignments_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "client_program_assignments_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    uniqueIndex("client_program_assignments_one_active_key")
      .on(t.workspaceId, t.clientId)
      .where(sql`${t.status} = 'active'`),
    index("client_program_assignments_program_id_idx").on(t.programId),
    index("client_program_assignments_created_by_user_id_idx").on(t.createdByUserId),
    check("client_program_assignments_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check(
      "client_program_assignments_status",
      sql`${t.status} in ('active', 'completed', 'ended')`,
    ),
    check("client_program_assignments_dates", sql`${t.endsOn} >= ${t.startsOn}`),
    check(
      "client_program_assignments_ended",
      sql`(${t.status} = 'active') = (${t.endedAt} is null)`,
    ),
    check(
      "client_program_assignments_schedule",
      sql`jsonb_typeof(${t.schedule}) = 'array' and jsonb_array_length(${t.schedule}) between 1 and 7`,
    ),
    check(
      "client_program_assignments_instructions_length",
      sql`char_length(${t.instructions}) <= 1000`,
    ),
    check(
      "client_program_assignments_equipment_notes_length",
      sql`char_length(${t.equipmentNotes}) <= 500`,
    ),
  ],
);

/**
 * Planned workouts generated from an assignment for a rolling window (PROMPT §8.5). Logging (step
 * 3.5) moves them planned → in_progress → completed | skipped. Planned ones may be removed when the
 * program ends; started ones are history and stay.
 */
export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    assignmentId: uuid("assignment_id").notNull(),
    workoutIndex: smallint("workout_index").notNull(),
    name: text("name").notNull(),
    scheduledOn: date("scheduled_on").notNull(),
    status: text("status").notNull().default("planned"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** The client's appointment this workout was done in (linked at start, ADR-0054). */
    appointmentId: uuid("appointment_id"),
    trainerFeedback: text("trainer_feedback"),
    /** How it went, from the client when they log it themselves (step 4.2). */
    clientFeedback: text("client_feedback"),
    skipReason: text("skip_reason"),
    ...timestamps,
  },
  (t) => [
    unique("workout_sessions_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "workout_sessions_appointment_fk",
      columns: [t.workspaceId, t.appointmentId],
      foreignColumns: [appointments.workspaceId, appointments.id],
    }),
    uniqueIndex("workout_sessions_appointment_key")
      .on(t.appointmentId)
      .where(sql`${t.appointmentId} is not null`),
    check(
      "workout_sessions_trainer_feedback_length",
      sql`char_length(${t.trainerFeedback}) <= 1000`,
    ),
    check("workout_sessions_client_feedback_length", sql`char_length(${t.clientFeedback}) <= 1000`),
    check("workout_sessions_skip_reason_length", sql`char_length(${t.skipReason}) <= 200`),
    check(
      "workout_sessions_lifecycle",
      sql`(${t.status} = 'planned' and ${t.startedAt} is null and ${t.completedAt} is null)
        or (${t.status} = 'in_progress' and ${t.startedAt} is not null and ${t.completedAt} is null)
        or (${t.status} = 'completed' and ${t.startedAt} is not null and ${t.completedAt} is not null)
        or (${t.status} = 'skipped' and ${t.completedAt} is null)`,
    ),
    foreignKey({
      name: "workout_sessions_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "workout_sessions_assignment_fk",
      columns: [t.workspaceId, t.assignmentId],
      foreignColumns: [clientProgramAssignments.workspaceId, clientProgramAssignments.id],
    }).onDelete("cascade"),
    unique("workout_sessions_slot_key").on(t.assignmentId, t.scheduledOn, t.workoutIndex),
    index("workout_sessions_workspace_client_scheduled_on_idx").on(
      t.workspaceId,
      t.clientId,
      t.scheduledOn,
    ),
    check("workout_sessions_workout_index", sql`${t.workoutIndex} between 0 and 6`),
    check("workout_sessions_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check(
      "workout_sessions_status",
      sql`${t.status} in ('planned', 'in_progress', 'completed', 'skipped')`,
    ),
  ],
);

/**
 * The exercises of a started workout (PROMPT §8.5): copied from the assignment snapshot when the
 * workout starts, so the program can change later without rewriting history. A substitution keeps
 * the planned exercise in `planned_exercise_id`; an exercise added during the workout has none.
 */
export const workoutSessionExercises = pgTable(
  "workout_session_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workoutSessionId: uuid("workout_session_id").notNull(),
    position: smallint("position").notNull(),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "restrict" }),
    plannedExerciseId: uuid("planned_exercise_id").references(() => exercises.id, {
      onDelete: "restrict",
    }),
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
    unique("workout_session_exercises_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "workout_session_exercises_session_fk",
      columns: [t.workspaceId, t.workoutSessionId],
      foreignColumns: [workoutSessions.workspaceId, workoutSessions.id],
    }).onDelete("cascade"),
    unique("workout_session_exercises_position_key").on(t.workoutSessionId, t.position),
    index("workout_session_exercises_exercise_id_idx").on(t.exerciseId),
    index("workout_session_exercises_planned_exercise_id_idx").on(t.plannedExerciseId),
    check("workout_session_exercises_position", sql`${t.position} between 1 and 40`),
    check("workout_session_exercises_sets", sql`${t.sets} between 1 and 20`),
    check(
      "workout_session_exercises_target",
      sql`(${t.durationSeconds} is not null and ${t.repsMin} is null and ${t.repsMax} is null)
        or (${t.durationSeconds} is null and ${t.repsMin} is not null)`,
    ),
    check(
      "workout_session_exercises_reps",
      sql`${t.repsMin} is null or (${t.repsMin} between 1 and 100 and coalesce(${t.repsMax}, ${t.repsMin}) between ${t.repsMin} and 100)`,
    ),
    check(
      "workout_session_exercises_duration",
      sql`${t.durationSeconds} is null or ${t.durationSeconds} between 5 and 7200`,
    ),
    check(
      "workout_session_exercises_load",
      sql`${t.targetLoadKg} is null or ${t.targetLoadKg} between 0 and 1000`,
    ),
    check(
      "workout_session_exercises_rest",
      sql`${t.restSeconds} is null or ${t.restSeconds} between 0 and 900`,
    ),
    check(
      "workout_session_exercises_trainer_notes_length",
      sql`char_length(${t.trainerNotes}) <= 500`,
    ),
    check(
      "workout_session_exercises_client_instructions_length",
      sql`char_length(${t.clientInstructions}) <= 500`,
    ),
  ],
);

/**
 * Logged sets (PROMPT §8.5). The id is generated by the device, so `PUT /workout-sets/:id` is an
 * idempotent upsert (CLAUDE.md rule 15). Editable only while the workout is in progress.
 */
export const workoutSets = pgTable(
  "workout_sets",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    workoutSessionExerciseId: uuid("workout_session_exercise_id").notNull(),
    setNumber: smallint("set_number").notNull(),
    reps: smallint("reps"),
    loadKg: numeric("load_kg", { precision: 6, scale: 2, mode: "number" }),
    durationSeconds: integer("duration_seconds"),
    rpe: numeric("rpe", { precision: 3, scale: 1, mode: "number" }),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "workout_sets_exercise_fk",
      columns: [t.workspaceId, t.workoutSessionExerciseId],
      foreignColumns: [workoutSessionExercises.workspaceId, workoutSessionExercises.id],
    }).onDelete("cascade"),
    unique("workout_sets_set_number_key").on(t.workoutSessionExerciseId, t.setNumber),
    index("workout_sets_workspace_id_idx").on(t.workspaceId),
    check("workout_sets_set_number", sql`${t.setNumber} between 1 and 20`),
    check("workout_sets_reps", sql`${t.reps} is null or ${t.reps} between 0 and 200`),
    check("workout_sets_load", sql`${t.loadKg} is null or ${t.loadKg} between 0 and 1000`),
    check(
      "workout_sets_duration",
      sql`${t.durationSeconds} is null or ${t.durationSeconds} between 0 and 7200`,
    ),
    check("workout_sets_rpe", sql`${t.rpe} is null or ${t.rpe} between 1 and 10`),
    check("workout_sets_completed", sql`${t.completed} = (${t.completedAt} is not null)`),
  ],
);
