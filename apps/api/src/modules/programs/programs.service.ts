import { Injectable } from "@nestjs/common";
import {
  type CreateProgramRequest,
  ERROR_CODES,
  type ExerciseCategory,
  type FitnessGoal,
  type MuscleGroup,
  type ProgramDetail,
  type ProgramInput,
  type ProgramListResponse,
  type ProgramSummary,
  type ProgramTemplatesResponse,
} from "@fitcoach/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import {
  clientProgramAssignments,
  exercises,
  programExercises,
  programs,
  programWorkouts,
} from "../../db/schema";

export type Trainer = AuthContext & { workspaceId: string };
type ProgramRow = typeof programs.$inferSelect;

const notFound = () => DomainError.notFound("That program doesn't exist.");
const invalid = (fieldErrors: Record<string, string[]>, message = "Some details need fixing.") =>
  new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, message, fieldErrors);

/**
 * Programs (PROMPT §8.5): global starter templates (read-only) and a workspace's own programs and
 * templates. The builder saves a program whole, in one transaction that replaces its workouts and
 * exercises (rule 14). Runs as fitcoach_app; every query also filters by the session's workspace.
 */
@Injectable()
export class ProgramsService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  trainer(): Trainer {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { ...auth, workspaceId: auth.workspaceId };
  }

  private visible(trainer: Trainer): SQL {
    return or(isNull(programs.workspaceId), eq(programs.workspaceId, trainer.workspaceId)) as SQL;
  }

  /** Clients currently following each program (a correlated count on the outer row). */
  private activeAssignmentsSql() {
    const outer = sql.identifier("programs");
    return sql<number>`(
      select count(*)::int from ${clientProgramAssignments} a
      where a.program_id = ${outer}.id and a.status = 'active'
    )`;
  }

  private summary(row: ProgramRow, active: number): ProgramSummary {
    return {
      id: row.id,
      name: row.name,
      goal: row.goal as FitnessGoal | null,
      durationWeeks: row.durationWeeks,
      daysPerWeek: row.daysPerWeek,
      isTemplate: row.isTemplate,
      archived: row.archivedAt !== null,
      activeAssignments: Number(active),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async list(archived: boolean): Promise<ProgramListResponse> {
    const trainer = this.trainer();
    const rows = await this.db.tx
      .select({ program: programs, active: this.activeAssignmentsSql() })
      .from(programs)
      .where(
        and(
          eq(programs.workspaceId, trainer.workspaceId),
          archived ? isNotNull(programs.archivedAt) : isNull(programs.archivedAt),
        ),
      )
      .orderBy(desc(programs.updatedAt), asc(programs.id));
    return { programs: rows.map((row) => this.summary(row.program, row.active)) };
  }

  /** Workouts and exercises of the given programs, in order. */
  private async contents(programIds: string[]) {
    if (programIds.length === 0) return { workouts: [], items: [] };
    const workouts = await this.db.tx
      .select()
      .from(programWorkouts)
      .where(inArray(programWorkouts.programId, programIds))
      .orderBy(asc(programWorkouts.position));
    const workoutIds = workouts.map((workout) => workout.id);
    const items = workoutIds.length
      ? await this.db.tx
          .select({ item: programExercises, exercise: exercises })
          .from(programExercises)
          .innerJoin(exercises, eq(exercises.id, programExercises.exerciseId))
          .where(inArray(programExercises.programWorkoutId, workoutIds))
          .orderBy(asc(programExercises.position))
      : [];
    return { workouts, items };
  }

  private toDetail(
    program: ProgramRow,
    active: number,
    { workouts, items }: Awaited<ReturnType<ProgramsService["contents"]>>,
  ): ProgramDetail {
    return {
      id: program.id,
      name: program.name,
      description: program.description,
      goal: program.goal as FitnessGoal | null,
      durationWeeks: program.durationWeeks,
      daysPerWeek: program.daysPerWeek,
      isTemplate: program.isTemplate,
      global: program.workspaceId === null,
      archived: program.archivedAt !== null,
      activeAssignments: Number(active),
      updatedAt: program.updatedAt.toISOString(),
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
                archived: exercise.archivedAt !== null,
              },
              sets: item.sets,
              repsMin: item.repsMin,
              repsMax: item.repsMax,
              durationSeconds: item.durationSeconds,
              targetLoadKg: item.targetLoadKg === null ? null : Number(item.targetLoadKg),
              restSeconds: item.restSeconds,
              trainerNotes: item.trainerNotes,
              clientInstructions: item.clientInstructions,
            })),
        })),
    };
  }

  async templates(): Promise<ProgramTemplatesResponse> {
    this.trainer();
    const rows = await this.db.tx
      .select()
      .from(programs)
      .where(and(isNull(programs.workspaceId), eq(programs.isTemplate, true)))
      .orderBy(asc(programs.sortOrder), asc(programs.name));
    const contents = await this.contents(rows.map((row) => row.id));
    return {
      templates: rows.map((row) => {
        const detail = this.toDetail(row, 0, contents);
        return {
          id: detail.id,
          name: detail.name,
          description: detail.description,
          goal: detail.goal,
          durationWeeks: detail.durationWeeks,
          daysPerWeek: detail.daysPerWeek,
          workouts: detail.workouts.map((workout) => ({
            ...workout,
            exercises: workout.exercises.map((item) => ({
              id: item.id,
              position: item.position,
              exercise: {
                id: item.exercise.id,
                name: item.exercise.name,
                category: item.exercise.category,
                muscleGroups: item.exercise.muscleGroups,
              },
              sets: item.sets,
              repsMin: item.repsMin,
              repsMax: item.repsMax,
              durationSeconds: item.durationSeconds,
              restSeconds: item.restSeconds,
              clientInstructions: item.clientInstructions,
            })),
          })),
        };
      }),
    };
  }

  /** A visible program (global or own) with its contents. */
  async detail(trainer: Trainer, id: string): Promise<ProgramDetail> {
    const [row] = await this.db.tx
      .select({ program: programs, active: this.activeAssignmentsSql() })
      .from(programs)
      .where(and(eq(programs.id, id), this.visible(trainer)));
    if (!row) throw notFound();
    return this.toDetail(row.program, row.active, await this.contents([id]));
  }

  get(id: string): Promise<ProgramDetail> {
    return this.detail(this.trainer(), id);
  }

  /** The trainer's own program, locked for the rest of the transaction. */
  private async lockOwn(trainer: Trainer, id: string): Promise<ProgramRow> {
    const [own] = await this.db.tx
      .select()
      .from(programs)
      .where(and(eq(programs.id, id), eq(programs.workspaceId, trainer.workspaceId)))
      .for("update");
    if (own) return own;
    const [global] = await this.db.tx
      .select({ id: programs.id })
      .from(programs)
      .where(and(eq(programs.id, id), isNull(programs.workspaceId)));
    if (global) {
      throw new DomainError(
        ERROR_CODES.FORBIDDEN,
        403,
        "Starter templates can't be changed. Use the template to make your own copy.",
      );
    }
    throw notFound();
  }

  /** Inserts workouts and their exercises for a program (positions from the array order). */
  private async writeContents(
    trainer: Trainer,
    programId: string,
    input: ProgramInput["workouts"],
  ) {
    const exerciseIds = [...new Set(input.flatMap((w) => w.exercises.map((e) => e.exerciseId)))];
    if (exerciseIds.length) {
      const known = await this.db.tx
        .select({ id: exercises.id })
        .from(exercises)
        .where(
          and(
            inArray(exercises.id, exerciseIds),
            or(isNull(exercises.workspaceId), eq(exercises.workspaceId, trainer.workspaceId)),
          ),
        );
      const found = new Set(known.map((row) => row.id));
      const fieldErrors: Record<string, string[]> = {};
      input.forEach((workout, w) =>
        workout.exercises.forEach((item, e) => {
          if (!found.has(item.exerciseId)) {
            fieldErrors[`workouts.${w}.exercises.${e}.exerciseId`] = [
              "That exercise doesn't exist",
            ];
          }
        }),
      );
      if (Object.keys(fieldErrors).length) throw invalid(fieldErrors);
    }
    for (const [index, workout] of input.entries()) {
      const [created] = await this.db.tx
        .insert(programWorkouts)
        .values({
          workspaceId: trainer.workspaceId,
          programId,
          name: workout.name,
          dayNumber: workout.dayNumber,
          position: index + 1,
          notes: workout.notes || null,
        })
        .returning({ id: programWorkouts.id });
      if (!created) throw new Error("workout insert returned no row");
      if (workout.exercises.length === 0) continue;
      await this.db.tx.insert(programExercises).values(
        workout.exercises.map((item, position) => ({
          workspaceId: trainer.workspaceId,
          programWorkoutId: created.id,
          exerciseId: item.exerciseId,
          position: position + 1,
          sets: item.sets,
          repsMin: item.repsMin,
          repsMax: item.durationSeconds === null ? (item.repsMax ?? item.repsMin) : null,
          durationSeconds: item.durationSeconds,
          targetLoadKg: item.targetLoadKg,
          restSeconds: item.restSeconds,
          trainerNotes: item.trainerNotes || null,
          clientInstructions: item.clientInstructions || null,
        })),
      );
    }
  }

  private toInput(detail: ProgramDetail): ProgramInput {
    return {
      name: detail.name,
      description: detail.description ?? undefined,
      goal: detail.goal,
      durationWeeks: detail.durationWeeks,
      workouts: detail.workouts.map((workout) => ({
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

  /**
   * A new program: blank (one empty Monday workout), or a copy of a starter template, one of your
   * templates or programs ("Start from template", "Duplicate", "Save as template").
   */
  async create(input: CreateProgramRequest): Promise<ProgramDetail> {
    const trainer = this.trainer();
    let source: ProgramInput = {
      name: "New program",
      goal: null,
      durationWeeks: 4,
      workouts: [{ name: "Workout 1", dayNumber: 1, exercises: [] }],
    };
    let sourceId: string | null = null;
    if (input.fromProgramId) {
      const from = await this.detail(trainer, input.fromProgramId);
      source = this.toInput(from);
      sourceId = from.id;
      if (!from.global && !input.name) source.name = `${from.name} (copy)`.slice(0, 80);
    }
    const [created] = await this.db.tx
      .insert(programs)
      .values({
        workspaceId: trainer.workspaceId,
        name: input.name ?? source.name,
        description: source.description || null,
        goal: source.goal,
        durationWeeks: source.durationWeeks,
        daysPerWeek: Math.max(1, source.workouts.length),
        isTemplate: input.asTemplate ?? false,
        sourceProgramId: sourceId,
        createdByUserId: trainer.userId,
      })
      .returning({ id: programs.id });
    if (!created) throw new Error("program insert returned no row");
    await this.writeContents(trainer, created.id, source.workouts);
    return this.detail(trainer, created.id);
  }

  /** The builder's Save: the whole program, replacing its workouts and exercises. */
  async save(id: string, input: ProgramInput): Promise<ProgramDetail> {
    const trainer = this.trainer();
    const program = await this.lockOwn(trainer, id);
    if (program.archivedAt) {
      throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "Restore this program to edit it.");
    }
    const old = await this.db.tx
      .select({ id: programWorkouts.id })
      .from(programWorkouts)
      .where(
        and(
          eq(programWorkouts.programId, id),
          eq(programWorkouts.workspaceId, trainer.workspaceId),
        ),
      );
    if (old.length) {
      const ids = old.map((row) => row.id);
      await this.db.tx
        .delete(programExercises)
        .where(
          and(
            inArray(programExercises.programWorkoutId, ids),
            eq(programExercises.workspaceId, trainer.workspaceId),
          ),
        );
      await this.db.tx
        .delete(programWorkouts)
        .where(
          and(
            inArray(programWorkouts.id, ids),
            eq(programWorkouts.workspaceId, trainer.workspaceId),
          ),
        );
    }
    await this.db.tx
      .update(programs)
      .set({
        name: input.name,
        description: input.description || null,
        goal: input.goal,
        durationWeeks: input.durationWeeks,
        daysPerWeek: input.workouts.length,
      })
      .where(and(eq(programs.id, id), eq(programs.workspaceId, trainer.workspaceId)));
    await this.writeContents(trainer, id, input.workouts);
    return this.detail(trainer, id);
  }

  async setArchived(id: string, archived: boolean): Promise<ProgramDetail> {
    const trainer = this.trainer();
    const program = await this.lockOwn(trainer, id);
    await this.db.tx
      .update(programs)
      .set({ archivedAt: archived ? (program.archivedAt ?? sql`now()`) : null })
      .where(and(eq(programs.id, id), eq(programs.workspaceId, trainer.workspaceId)));
    return this.detail(trainer, id);
  }
}
