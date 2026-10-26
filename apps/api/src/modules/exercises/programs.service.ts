import { Injectable } from "@nestjs/common";
import type {
  ExerciseCategory,
  FitnessGoal,
  MuscleGroup,
  ProgramTemplatesResponse,
} from "@fitcoach/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import { exercises, programExercises, programs, programWorkouts } from "../../db/schema";

/**
 * Starter program templates (PROMPT §8.5, D21): global, read-only. Copying a template and the
 * program builder come in step 3.4, which also adds a workspace's own programs here.
 */
@Injectable()
export class ProgramsService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async templates(): Promise<ProgramTemplatesResponse> {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();

    const rows = await this.db.tx
      .select()
      .from(programs)
      .where(and(isNull(programs.workspaceId), eq(programs.isTemplate, true)))
      .orderBy(asc(programs.sortOrder), asc(programs.name));
    const ids = rows.map((row) => row.id);
    const workouts = ids.length
      ? await this.db.tx
          .select()
          .from(programWorkouts)
          .where(and(isNull(programWorkouts.workspaceId), inArray(programWorkouts.programId, ids)))
          .orderBy(asc(programWorkouts.position))
      : [];
    const workoutIds = workouts.map((workout) => workout.id);
    const items = workoutIds.length
      ? await this.db.tx
          .select({ item: programExercises, exercise: exercises })
          .from(programExercises)
          .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
          .where(
            and(
              isNull(programExercises.workspaceId),
              inArray(programExercises.programWorkoutId, workoutIds),
            ),
          )
          .orderBy(asc(programExercises.position))
      : [];

    return {
      templates: rows.map((program) => ({
        id: program.id,
        name: program.name,
        description: program.description,
        goal: program.goal as FitnessGoal | null,
        durationWeeks: program.durationWeeks,
        daysPerWeek: program.daysPerWeek,
        workouts: workouts
          .filter((workout) => workout.programId === program.id)
          .map((workout) => ({
            id: workout.id,
            name: workout.name,
            dayNumber: workout.dayNumber,
            notes: workout.notes,
            exercises: items
              .filter(({ item }) => item.programWorkoutId === workout.id)
              .map(({ item, exercise }) => ({
                id: item.id,
                position: item.position,
                exercise: {
                  id: exercise.id,
                  name: exercise.name,
                  category: exercise.category as ExerciseCategory,
                  muscleGroups: exercise.muscleGroups as MuscleGroup[],
                },
                sets: item.sets,
                repsMin: item.repsMin,
                repsMax: item.repsMax,
                durationSeconds: item.durationSeconds,
                restSeconds: item.restSeconds,
                clientInstructions: item.clientInstructions,
              })),
          })),
      })),
    };
  }
}
