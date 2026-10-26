import { z } from "zod";
import { FITNESS_GOALS } from "./leads";

/** Exercise library and starter program templates (PROMPT §8.5, D21, step 3.3). */

export const EXERCISE_CATEGORIES = ["strength", "cardio", "plyometric", "mobility"] as const;
export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];
export const EXERCISE_CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: "Strength",
  cardio: "Cardio",
  plyometric: "Plyometric",
  mobility: "Mobility & stretching",
};

export const MUSCLE_GROUPS = [
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
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  core: "Core",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
  hips: "Hips",
  full_body: "Full body",
};

export const EQUIPMENT = [
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
] as const;
export type Equipment = (typeof EQUIPMENT)[number];
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  bodyweight: "Bodyweight",
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  band: "Resistance band",
  cable: "Cable",
  machine: "Machine",
  bench: "Bench",
  pull_up_bar: "Pull-up bar",
  box: "Box / step",
  cardio_machine: "Cardio machine",
  mat: "Mat",
};

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional();

/** A custom exercise (global ones are read-only). Media is a link; uploads are v1.1. */
export const exerciseInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80, "Use at most 80 characters"),
  category: z.enum(EXERCISE_CATEGORIES),
  muscleGroups: z
    .array(z.enum(MUSCLE_GROUPS))
    .min(1, "Pick at least one muscle group")
    .max(6, "Pick at most 6"),
  equipment: z.array(z.enum(EQUIPMENT)).min(1, "Pick the equipment (or bodyweight)").max(5),
  difficulty: z.enum(DIFFICULTIES),
  instructions: optionalText(1500),
  safetyNotes: optionalText(600),
  mediaUrl: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .url("Enter a full link starting with https://")
        .max(500)
        .refine((url) => url.startsWith("https://"), "Use a secure (https://) link"),
    ])
    .optional(),
});
export type ExerciseInput = z.infer<typeof exerciseInputSchema>;

export const exerciseListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.enum(EXERCISE_CATEGORIES).optional(),
  muscle: z.enum(MUSCLE_GROUPS).optional(),
  equipment: z.enum(EQUIPMENT).optional(),
  /** `custom` = this workspace's own exercises only. */
  source: z.enum(["all", "library", "custom"]).default("all"),
  archived: z.coerce.boolean().default(false),
});
export type ExerciseListQuery = z.infer<typeof exerciseListQuerySchema>;

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  category: z.enum(EXERCISE_CATEGORIES),
  muscleGroups: z.array(z.enum(MUSCLE_GROUPS)),
  equipment: z.array(z.enum(EQUIPMENT)),
  difficulty: z.enum(DIFFICULTIES),
  instructions: z.string().max(1500).nullable(),
  safetyNotes: z.string().max(600).nullable(),
  mediaUrl: z.string().max(500).nullable(),
  /** Global library exercise (read-only) vs this workspace's own. */
  custom: z.boolean(),
  archived: z.boolean(),
  substitutions: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
});
export type Exercise = z.infer<typeof exerciseSchema>;

export const exerciseListResponseSchema = z.object({
  exercises: z.array(exerciseSchema),
  /** Before filters: library and custom counts, for the header. */
  totals: z.object({ library: z.number().int(), custom: z.number().int() }),
});
export type ExerciseListResponse = z.infer<typeof exerciseListResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Starter program templates (read-only here; copying and the builder come in step 3.4)
// ---------------------------------------------------------------------------------------------

export const programExerciseSchema = z.object({
  id: z.string().uuid(),
  position: z.number().int(),
  exercise: z.object({
    id: z.string().uuid(),
    name: z.string(),
    category: z.enum(EXERCISE_CATEGORIES),
    muscleGroups: z.array(z.enum(MUSCLE_GROUPS)),
  }),
  sets: z.number().int(),
  repsMin: z.number().int().nullable(),
  repsMax: z.number().int().nullable(),
  durationSeconds: z.number().int().nullable(),
  restSeconds: z.number().int().nullable(),
  clientInstructions: z.string().max(500).nullable(),
});
export type ProgramExercise = z.infer<typeof programExerciseSchema>;

export const programTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().max(1000).nullable(),
  goal: z.enum(FITNESS_GOALS).nullable(),
  durationWeeks: z.number().int(),
  daysPerWeek: z.number().int(),
  workouts: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      dayNumber: z.number().int(),
      notes: z.string().max(1000).nullable(),
      exercises: z.array(programExerciseSchema),
    }),
  ),
});
export type ProgramTemplate = z.infer<typeof programTemplateSchema>;

export const programTemplatesResponseSchema = z.object({
  templates: z.array(programTemplateSchema),
});
export type ProgramTemplatesResponse = z.infer<typeof programTemplatesResponseSchema>;

/** "8–12 reps", "10 reps" or "45 s" for a planned exercise. */
export function targetLabel(
  item: Pick<ProgramExercise, "repsMin" | "repsMax" | "durationSeconds">,
): string {
  if (item.durationSeconds !== null) {
    return item.durationSeconds % 60 === 0 && item.durationSeconds >= 60
      ? `${item.durationSeconds / 60} min`
      : `${item.durationSeconds} s`;
  }
  if (item.repsMin !== null && item.repsMax !== null && item.repsMax !== item.repsMin) {
    return `${item.repsMin}–${item.repsMax} reps`;
  }
  return `${item.repsMin ?? item.repsMax ?? 0} reps`;
}
