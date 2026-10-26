import { Injectable } from "@nestjs/common";
import {
  type Difficulty,
  type Equipment,
  ERROR_CODES,
  type Exercise,
  type ExerciseCategory,
  type ExerciseInput,
  type ExerciseListQuery,
  type ExerciseListResponse,
  type MuscleGroup,
} from "@fitcoach/shared";
import { and, asc, eq, inArray, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import { exercises } from "../../db/schema";

type Trainer = AuthContext & { workspaceId: string };
type ExerciseRow = typeof exercises.$inferSelect;

const notFound = () => DomainError.notFound("That exercise doesn't exist.");
const readOnly = () =>
  new DomainError(
    ERROR_CODES.FORBIDDEN,
    403,
    "Library exercises can't be changed. Add your own version instead.",
  );

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Postgres unique violation on the per-workspace name index. */
function isDuplicateName(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
  const pg = cause as { code?: string; constraint?: string };
  return pg.code === "23505" && pg.constraint === "exercises_workspace_name_key";
}

/**
 * Exercise library (PROMPT §8.5, D21): the global seed (read-only) plus a workspace's custom
 * exercises. Runs in the request transaction as fitcoach_app; reads are limited to global rows and
 * the session's workspace (CLAUDE.md rules 1 and 3).
 */
@Injectable()
export class ExercisesService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  private trainer(): Trainer {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { ...auth, workspaceId: auth.workspaceId };
  }

  private visible(trainer: Trainer): SQL {
    return or(isNull(exercises.workspaceId), eq(exercises.workspaceId, trainer.workspaceId)) as SQL;
  }

  private async toExercises(rows: ExerciseRow[]): Promise<Exercise[]> {
    const ids = [...new Set(rows.flatMap((row) => row.substitutionIds))];
    const subs = ids.length
      ? await this.db.tx
          .select({ id: exercises.id, name: exercises.name })
          .from(exercises)
          .where(and(inArray(exercises.id, ids), isNull(exercises.workspaceId)))
      : [];
    const names = new Map(subs.map((sub) => [sub.id, sub.name]));
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category as ExerciseCategory,
      muscleGroups: row.muscleGroups as MuscleGroup[],
      equipment: row.equipment as Equipment[],
      difficulty: row.difficulty as Difficulty,
      instructions: row.instructions,
      safetyNotes: row.safetyNotes,
      mediaUrl: row.mediaUrl,
      custom: row.workspaceId !== null,
      archived: row.archivedAt !== null,
      substitutions: row.substitutionIds.flatMap((id) => {
        const name = names.get(id);
        return name ? [{ id, name }] : [];
      }),
    }));
  }

  async list(query: ExerciseListQuery): Promise<ExerciseListResponse> {
    const trainer = this.trainer();
    const conditions: SQL[] = [this.visible(trainer)];
    if (query.source === "library") conditions.push(isNull(exercises.workspaceId));
    if (query.source === "custom") conditions.push(eq(exercises.workspaceId, trainer.workspaceId));
    conditions.push(
      query.archived ? isNotNull(exercises.archivedAt) : isNull(exercises.archivedAt),
    );
    if (query.category) conditions.push(eq(exercises.category, query.category));
    if (query.muscle) conditions.push(sql`${query.muscle} = any(${exercises.muscleGroups})`);
    if (query.equipment) conditions.push(sql`${query.equipment} = any(${exercises.equipment})`);
    const term = query.q?.trim();
    if (term) conditions.push(sql`${exercises.name} ilike ${likePattern(term)}`);

    const rows = await this.db.tx
      .select()
      .from(exercises)
      .where(and(...conditions))
      .orderBy(asc(sql`lower(${exercises.name})`), asc(exercises.id))
      .limit(500);
    const [totals] = await this.db.tx
      .select({
        library: sql<number>`count(*) filter (where ${exercises.workspaceId} is null)::int`,
        custom: sql<number>`count(*) filter (where ${exercises.workspaceId} is not null)::int`,
      })
      .from(exercises)
      .where(and(this.visible(trainer), isNull(exercises.archivedAt)));
    return {
      exercises: await this.toExercises(rows),
      totals: { library: totals?.library ?? 0, custom: totals?.custom ?? 0 },
    };
  }

  private async find(trainer: Trainer, id: string): Promise<ExerciseRow> {
    const [row] = await this.db.tx
      .select()
      .from(exercises)
      .where(and(eq(exercises.id, id), this.visible(trainer)));
    if (!row) throw notFound();
    return row;
  }

  async get(id: string): Promise<Exercise> {
    const [exercise] = await this.toExercises([await this.find(this.trainer(), id)]);
    if (!exercise) throw notFound();
    return exercise;
  }

  private values(input: ExerciseInput) {
    return {
      name: input.name,
      category: input.category,
      muscleGroups: [...new Set(input.muscleGroups)],
      equipment: [...new Set(input.equipment)],
      difficulty: input.difficulty,
      instructions: input.instructions || null,
      safetyNotes: input.safetyNotes || null,
      mediaUrl: input.mediaUrl || null,
    };
  }

  private duplicate(name: string) {
    return new DomainError(
      ERROR_CODES.CONFLICT_DUPLICATE,
      409,
      `You already have an exercise called “${name}”.`,
      { name: ["You already have an exercise with this name"] },
    );
  }

  async create(input: ExerciseInput): Promise<Exercise> {
    const trainer = this.trainer();
    try {
      const [row] = await this.db.tx
        .insert(exercises)
        .values({
          ...this.values(input),
          workspaceId: trainer.workspaceId,
          createdByUserId: trainer.userId,
        })
        .returning();
      if (!row) throw new Error("exercise insert returned no row");
      const [exercise] = await this.toExercises([row]);
      if (!exercise) throw new Error("exercise mapping failed");
      return exercise;
    } catch (error) {
      if (isDuplicateName(error)) throw this.duplicate(input.name);
      throw error;
    }
  }

  /** Only a workspace's own, live exercises change; the library is read-only. */
  private async own(trainer: Trainer, id: string): Promise<ExerciseRow> {
    const row = await this.find(trainer, id);
    if (row.workspaceId === null) throw readOnly();
    return row;
  }

  async update(id: string, input: ExerciseInput): Promise<Exercise> {
    const trainer = this.trainer();
    const row = await this.own(trainer, id);
    if (row.archivedAt) {
      throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "Restore this exercise to edit it.");
    }
    try {
      await this.db.tx
        .update(exercises)
        .set(this.values(input))
        .where(and(eq(exercises.id, id), eq(exercises.workspaceId, trainer.workspaceId)));
    } catch (error) {
      if (isDuplicateName(error)) throw this.duplicate(input.name);
      throw error;
    }
    return this.get(id);
  }

  /** Archive (hidden from pickers, kept for programs and history) or restore. */
  async setArchived(id: string, archived: boolean): Promise<Exercise> {
    const trainer = this.trainer();
    const row = await this.own(trainer, id);
    try {
      await this.db.tx
        .update(exercises)
        .set({ archivedAt: archived ? (row.archivedAt ?? sql`now()`) : null })
        .where(and(eq(exercises.id, id), eq(exercises.workspaceId, trainer.workspaceId)));
    } catch (error) {
      if (isDuplicateName(error)) throw this.duplicate(row.name);
      throw error;
    }
    return this.get(id);
  }
}
