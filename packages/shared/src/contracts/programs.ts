import { z } from "zod";
import { EXERCISE_CATEGORIES, MUSCLE_GROUPS } from "./exercises";
import { FITNESS_GOALS } from "./leads";

/** Program builder and assignment (PROMPT §8.5, step 3.4). */

/**
 * A workout's day slot is a weekday: 1 = Monday … 7 = Sunday. Full names; the short ones are
 * WEEKDAY_LABELS (scheduling).
 */
export const WEEKDAY_NAMES: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export const PROGRAM_WORKOUTS_MAX = 7;
export const WORKOUT_EXERCISES_MAX = 30;
/** Planned sessions are generated this many days ahead; a daily job keeps the window rolling. */
export const SESSION_WINDOW_DAYS = 28;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional();
const whole = (min: number, max: number) =>
  z
    .number("Enter a number")
    .int("Use a whole number")
    .min(min, `Use ${min} or more`)
    .max(max, `Use ${max} or less`);
const weekday = whole(1, 7);

export const programExerciseInputSchema = z
  .object({
    exerciseId: z.string().uuid("Choose an exercise"),
    sets: whole(1, 20),
    repsMin: whole(1, 100).nullable(),
    repsMax: whole(1, 100).nullable(),
    durationSeconds: whole(5, 7200).nullable(),
    targetLoadKg: z
      .number("Enter a number")
      .min(0, "Use 0 or more")
      .max(1000, "Use 1000 or less")
      .multipleOf(0.25, "Use steps of 0.25 kg")
      .nullable(),
    restSeconds: whole(0, 900).nullable(),
    trainerNotes: optionalText(500),
    clientInstructions: optionalText(500),
  })
  .superRefine((item, ctx) => {
    if (item.durationSeconds === null && item.repsMin === null) {
      ctx.addIssue({ code: "custom", path: ["repsMin"], message: "Enter reps or a time" });
    }
    if (item.durationSeconds !== null && (item.repsMin !== null || item.repsMax !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["durationSeconds"],
        message: "Use reps or a time, not both",
      });
    }
    if (item.repsMin !== null && item.repsMax !== null && item.repsMax < item.repsMin) {
      ctx.addIssue({ code: "custom", path: ["repsMax"], message: "At least the minimum" });
    }
  });
export type ProgramExerciseInput = z.infer<typeof programExerciseInputSchema>;

export const programWorkoutInputSchema = z.object({
  name: z.string().trim().min(1, "Name the workout").max(80),
  dayNumber: weekday,
  notes: optionalText(1000),
  exercises: z.array(programExerciseInputSchema).max(WORKOUT_EXERCISES_MAX),
});
export type ProgramWorkoutInput = z.infer<typeof programWorkoutInputSchema>;

/** The whole program, saved at once (workouts and exercises in order). */
export const programInputSchema = z
  .object({
    name: z.string().trim().min(1, "Name the program").max(80),
    description: optionalText(1000),
    goal: z.enum(FITNESS_GOALS).nullable(),
    durationWeeks: whole(1, 52),
    workouts: z
      .array(programWorkoutInputSchema)
      .min(1, "Add at least one workout")
      .max(PROGRAM_WORKOUTS_MAX, "At most 7 workouts"),
  })
  .superRefine((program, ctx) => {
    const seen = new Set<number>();
    program.workouts.forEach((workout, index) => {
      if (seen.has(workout.dayNumber)) {
        ctx.addIssue({
          code: "custom",
          path: ["workouts", index, "dayNumber"],
          message: "Another workout is on this day",
        });
      }
      seen.add(workout.dayNumber);
    });
  });
export type ProgramInput = z.infer<typeof programInputSchema>;

/** New blank program, or a copy (of a starter template, your template or your program). */
export const createProgramRequestSchema = z.object({
  fromProgramId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  /** Save the copy as one of your templates. */
  asTemplate: z.boolean().optional(),
});
export type CreateProgramRequest = z.infer<typeof createProgramRequestSchema>;

export const programDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().max(1000).nullable(),
  goal: z.enum(FITNESS_GOALS).nullable(),
  durationWeeks: z.number().int(),
  daysPerWeek: z.number().int(),
  isTemplate: z.boolean(),
  /** A FitCoach starter template: read-only, use it as a starting point. */
  global: z.boolean(),
  archived: z.boolean(),
  /** Clients currently following it (a copy of it, taken at assignment). */
  activeAssignments: z.number().int(),
  updatedAt: z.string().datetime(),
  workouts: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      dayNumber: z.number().int(),
      notes: z.string().max(1000).nullable(),
      exercises: z.array(
        z.object({
          id: z.string().uuid(),
          position: z.number().int(),
          exercise: z.object({
            id: z.string().uuid(),
            name: z.string(),
            category: z.enum(EXERCISE_CATEGORIES),
            muscleGroups: z.array(z.enum(MUSCLE_GROUPS)),
            archived: z.boolean(),
          }),
          sets: z.number().int(),
          repsMin: z.number().int().nullable(),
          repsMax: z.number().int().nullable(),
          durationSeconds: z.number().int().nullable(),
          targetLoadKg: z.number().nullable(),
          restSeconds: z.number().int().nullable(),
          trainerNotes: z.string().max(500).nullable(),
          clientInstructions: z.string().max(500).nullable(),
        }),
      ),
    }),
  ),
});
export type ProgramDetail = z.infer<typeof programDetailSchema>;

export const programSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  goal: z.enum(FITNESS_GOALS).nullable(),
  durationWeeks: z.number().int(),
  daysPerWeek: z.number().int(),
  isTemplate: z.boolean(),
  archived: z.boolean(),
  activeAssignments: z.number().int(),
  updatedAt: z.string().datetime(),
});
export type ProgramSummary = z.infer<typeof programSummarySchema>;

export const programListResponseSchema = z.object({
  /** Your programs and your templates (archived ones on request). */
  programs: z.array(programSummarySchema),
});
export type ProgramListResponse = z.infer<typeof programListResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Assignment and planned sessions
// ---------------------------------------------------------------------------------------------

export const assignProgramRequestSchema = z
  .object({
    clientId: z.string().uuid("Choose a client"),
    startsOn: isoDate,
    /** One weekday per workout, in workout order. */
    schedule: z
      .array(z.object({ workoutIndex: whole(0, PROGRAM_WORKOUTS_MAX - 1), weekday }))
      .min(1)
      .max(PROGRAM_WORKOUTS_MAX),
    instructions: optionalText(1000),
    equipmentNotes: optionalText(500),
  })
  .superRefine((input, ctx) => {
    const days = new Set<number>();
    input.schedule.forEach((slot, index) => {
      if (days.has(slot.weekday)) {
        ctx.addIssue({
          code: "custom",
          path: ["schedule", index, "weekday"],
          message: "Two workouts on the same day",
        });
      }
      days.add(slot.weekday);
    });
  });
export type AssignProgramRequest = z.infer<typeof assignProgramRequestSchema>;

export const ASSIGNMENT_STATUSES = ["active", "completed", "ended"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const WORKOUT_SESSION_STATUSES = ["planned", "in_progress", "completed", "skipped"] as const;
export type WorkoutSessionStatus = (typeof WORKOUT_SESSION_STATUSES)[number];
export const WORKOUT_SESSION_STATUS_LABELS: Record<WorkoutSessionStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  skipped: "Skipped",
};

export const assignmentSchema = z.object({
  id: z.string().uuid(),
  programId: z.string().uuid().nullable(),
  name: z.string(),
  startsOn: z.string().max(10),
  endsOn: z.string().max(10),
  status: z.enum(ASSIGNMENT_STATUSES),
  schedule: z.array(
    z.object({ workoutIndex: z.number().int(), name: z.string(), weekday: z.number().int() }),
  ),
  instructions: z.string().max(1000).nullable(),
  equipmentNotes: z.string().max(500).nullable(),
  createdAt: z.string().datetime(),
});
export type Assignment = z.infer<typeof assignmentSchema>;

export const workoutSessionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  scheduledOn: z.string().max(10),
  status: z.enum(WORKOUT_SESSION_STATUSES),
  workoutIndex: z.number().int(),
});
export type WorkoutSession = z.infer<typeof workoutSessionSchema>;

export const clientWorkoutsResponseSchema = z.object({
  assignment: assignmentSchema.nullable(),
  upcoming: z.array(workoutSessionSchema),
  recent: z.array(workoutSessionSchema),
});
export type ClientWorkoutsResponse = z.infer<typeof clientWorkoutsResponseSchema>;

export const assignProgramResponseSchema = z.object({
  assignment: assignmentSchema,
  sessionsPlanned: z.number().int(),
  /** The client's previous active program, now ended. */
  replaced: z.string().max(80).nullable(),
});
export type AssignProgramResponse = z.infer<typeof assignProgramResponseSchema>;
