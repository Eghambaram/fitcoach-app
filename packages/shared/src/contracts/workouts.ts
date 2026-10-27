import { z } from "zod";
import { EQUIPMENT, EXERCISE_CATEGORIES, MUSCLE_GROUPS } from "./exercises";
import { programExerciseInputSchema, WORKOUT_SESSION_STATUSES } from "./programs";
import { APPOINTMENT_STATUSES } from "./scheduling";

/** Live workout logging (PROMPT §8.5, step 3.5). */

export const WORKOUT_SET_MAX = 20;
export const WORKOUT_EXERCISES_LOGGED_MAX = 40;

const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional();

/**
 * One set, saved as soon as it changes. The id is generated on the device (a UUID per set), so
 * repeating the request after a dropped connection or a refresh changes nothing (rule 15).
 */
export const putWorkoutSetRequestSchema = z
  .object({
    sessionExerciseId: z.string().uuid(),
    setNumber: z.number().int().min(1).max(WORKOUT_SET_MAX, `At most ${WORKOUT_SET_MAX} sets`),
    reps: z
      .number("Enter a number")
      .int("Use a whole number")
      .min(0, "Use 0 or more")
      .max(200, "Use 200 or less")
      .nullable(),
    loadKg: z
      .number("Enter a number")
      .min(0, "Use 0 or more")
      .max(1000, "Use 1000 or less")
      .multipleOf(0.25, "Use steps of 0.25 kg")
      .nullable(),
    durationSeconds: z
      .number("Enter a number")
      .int("Use whole seconds")
      .min(0, "Use 0 or more")
      .max(7200, "At most 2 hours")
      .nullable(),
    /** Optional effort, 1–10 in half steps. */
    rpe: z
      .number("Enter a number")
      .min(1, "Use 1 to 10")
      .max(10, "Use 1 to 10")
      .multipleOf(0.5, "Use half steps")
      .nullable(),
    completed: z.boolean(),
  })
  .superRefine((set, ctx) => {
    if (set.completed && set.reps === null && set.durationSeconds === null) {
      ctx.addIssue({ code: "custom", path: ["reps"], message: "Enter reps or a time" });
    }
  });
export type PutWorkoutSetRequest = z.infer<typeof putWorkoutSetRequestSchema>;

export const substituteExerciseRequestSchema = z.object({
  exerciseId: z.string().uuid("Choose an exercise"),
});
export type SubstituteExerciseRequest = z.infer<typeof substituteExerciseRequestSchema>;

/** An exercise added during the workout: the same targets as in the builder. */
export const addWorkoutExerciseRequestSchema = programExerciseInputSchema;
export type AddWorkoutExerciseRequest = z.infer<typeof addWorkoutExerciseRequestSchema>;

export const finishWorkoutRequestSchema = z.object({
  /** Trainer feedback on the session; part of the client's history. */
  feedback: optionalText(1000),
});
export type FinishWorkoutRequest = z.infer<typeof finishWorkoutRequestSchema>;

export const skipWorkoutRequestSchema = z.object({
  reason: optionalText(200),
});
export type SkipWorkoutRequest = z.infer<typeof skipWorkoutRequestSchema>;

export const workoutSetSchema = z.object({
  id: z.string().uuid(),
  setNumber: z.number().int(),
  reps: z.number().int().nullable(),
  loadKg: z.number().nullable(),
  durationSeconds: z.number().int().nullable(),
  rpe: z.number().nullable(),
  completed: z.boolean(),
  completedAt: z.string().datetime().nullable(),
});
export type WorkoutSet = z.infer<typeof workoutSetSchema>;

const exerciseRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export const workoutExerciseSchema = z.object({
  /** Null until the workout starts (a preview from the program). */
  id: z.string().uuid().nullable(),
  position: z.number().int(),
  exercise: exerciseRefSchema.extend({
    category: z.enum(EXERCISE_CATEGORIES),
    muscleGroups: z.array(z.enum(MUSCLE_GROUPS)),
    equipment: z.array(z.enum(EQUIPMENT)),
    /** A licensed external image or video link; null shows a placeholder. */
    mediaUrl: z.string().max(500).nullable(),
  }),
  /** The planned exercise when this one replaced it. */
  substitutedFor: exerciseRefSchema.nullable(),
  /** Added during the workout, not in the program. */
  added: z.boolean(),
  /** Library suggestions that train the same pattern. */
  substitutions: z.array(exerciseRefSchema),
  sets: z.number().int(),
  repsMin: z.number().int().nullable(),
  repsMax: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  targetLoadKg: z.number().nullable(),
  restSeconds: z.number().int().nullable(),
  trainerNotes: z.string().max(500).nullable(),
  clientInstructions: z.string().max(500).nullable(),
  logged: z.array(workoutSetSchema),
  /** Every target set is completed. */
  done: z.boolean(),
});
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

export const workoutSummarySchema = z.object({
  exercisesTotal: z.number().int(),
  exercisesDone: z.number().int(),
  setsPlanned: z.number().int(),
  setsCompleted: z.number().int(),
  /** Σ reps × load over completed sets. */
  volumeKg: z.number(),
  /** Start to finish (or to now while in progress). */
  durationMinutes: z.number().int().nullable(),
  /** Rough time from the targets: sets × (work + rest). An estimate. */
  estimatedMinutes: z.number().int(),
});
export type WorkoutSummary = z.infer<typeof workoutSummarySchema>;

export const workoutDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  scheduledOn: z.string().max(10),
  status: z.enum(WORKOUT_SESSION_STATUSES),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  /** Trainer feedback (trainer view only; null in the client app). */
  feedback: z.string().max(1000).nullable(),
  /** The client's own feedback when they logged it themselves. */
  clientFeedback: z.string().max(1000).nullable(),
  skipReason: z.string().max(200).nullable(),
  client: z.object({ id: z.string().uuid(), fullName: z.string(), active: z.boolean() }),
  program: z.object({
    name: z.string(),
    notes: z.string().max(1000).nullable(),
    instructions: z.string().max(1000).nullable(),
    equipmentNotes: z.string().max(500).nullable(),
  }),
  /**
   * The client's appointment this workout was done in (linked when it started). Finishing offers
   * "Mark attended" while it is still scheduled/confirmed and has started.
   */
  appointment: z
    .object({
      id: z.string().uuid(),
      status: z.enum(APPOINTMENT_STATUSES),
      startsAt: z.string().datetime(),
      started: z.boolean(),
    })
    .nullable(),
  exercises: z.array(workoutExerciseSchema),
  summary: workoutSummarySchema,
});
export type WorkoutDetail = z.infer<typeof workoutDetailSchema>;
