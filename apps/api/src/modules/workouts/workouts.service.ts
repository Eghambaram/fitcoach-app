import { Injectable } from "@nestjs/common";
import {
  type AddWorkoutExerciseRequest,
  type AppointmentStatus,
  ERROR_CODES,
  type Equipment,
  type ExerciseCategory,
  type FinishWorkoutRequest,
  type MuscleGroup,
  type ProgramDetail,
  type PutWorkoutSetRequest,
  type SkipWorkoutRequest,
  type SubstituteExerciseRequest,
  WORKOUT_EXERCISES_LOGGED_MAX,
  type WorkoutDetail,
  type WorkoutExercise,
  type WorkoutSessionStatus,
  type WorkoutSet,
} from "@fitcoach/shared";
import { and, asc, eq, inArray, isNull, max, or, type SQL, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import type { AppClsStore } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import {
  appointments,
  clientProgramAssignments,
  clients,
  exercises,
  workoutSessionExercises,
  workoutSessions,
  workoutSets,
  workspaces,
} from "../../db/schema";

/**
 * Who is logging: a trainer (any workout in their workspace) or a client (only their own, step
 * 4.2). Always from the session (CLAUDE.md rule 1).
 */
export type Scope = {
  actor: "trainer" | "client";
  userId: string;
  workspaceId: string;
  clientId: string | null;
};

type SessionRow = typeof workoutSessions.$inferSelect;
type SnapshotExercise = ProgramDetail["workouts"][number]["exercises"][number];
type ExerciseRow = Pick<
  typeof exercises.$inferSelect,
  "id" | "name" | "category" | "muscleGroups" | "equipment" | "mediaUrl" | "substitutionIds"
> & { usable: boolean };
/** A row of the workout before or after it started (`id` null = a preview from the snapshot). */
type PlanRow = Omit<
  WorkoutExercise,
  "exercise" | "substitutedFor" | "added" | "substitutions" | "logged" | "done"
> & {
  exerciseId: string;
  plannedExerciseId: string | null;
};

/** Rough minutes from the targets: sets × (work + rest); ~4 s per rep. Shown as an estimate. */
function estimateMinutes(items: WorkoutExercise[]): number {
  const seconds = items.reduce((total, item) => {
    const work = item.durationSeconds ?? (item.repsMax ?? item.repsMin ?? 10) * 4;
    return total + item.sets * (work + (item.restSeconds ?? 60));
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}

const notFound = () => DomainError.notFound("That workout doesn't exist.");
const notInProgress = (status: WorkoutSessionStatus) =>
  new DomainError(
    ERROR_CODES.CONFLICT_STATE,
    409,
    status === "planned"
      ? "Start the workout first."
      : status === "completed"
        ? "This workout is finished, so it can't change."
        : "This workout was skipped, so it can't change.",
  );
const invalid = (fieldErrors: Record<string, string[]>, message = "Some details need fixing.") =>
  new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, message, fieldErrors);

/**
 * Live workout logging (PROMPT §8.5): planned → in_progress → completed | skipped. Starting copies
 * the workout from the assignment snapshot into `workout_session_exercises` and links the client's
 * appointment of the day; each set is an idempotent upsert keyed by a device-generated id. Every
 * mutation locks the session row first, so concurrent saves on one workout are serialized (rule 14).
 * Opening a workout never changes it.
 */
@Injectable()
export class WorkoutsService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly idempotency: IdempotencyService,
  ) {}

  scope(): Scope {
    const auth = this.cls.get("auth");
    if (auth?.actor === "trainer" && auth.workspaceId) {
      return {
        actor: "trainer",
        userId: auth.userId,
        workspaceId: auth.workspaceId,
        clientId: null,
      };
    }
    if (auth?.actor === "client" && auth.workspaceId && auth.clientId) {
      return {
        actor: "client",
        userId: auth.userId,
        workspaceId: auth.workspaceId,
        clientId: auth.clientId,
      };
    }
    throw DomainError.forbidden();
  }

  /** The workout, within the scope: a client only ever reaches their own. */
  private sessionWhere(scope: Scope, id: string): SQL {
    return and(
      eq(workoutSessions.id, id),
      eq(workoutSessions.workspaceId, scope.workspaceId),
      scope.clientId ? eq(workoutSessions.clientId, scope.clientId) : undefined,
    ) as SQL;
  }

  private trainerOnly(scope: Scope): void {
    if (scope.actor !== "trainer") throw DomainError.forbidden();
  }

  /**
   * The session, locked while it can still change. FOR UPDATE also applies the UPDATE policy, which
   * hides finished and skipped sessions, so those are read without a lock (they can't change).
   */
  private async lock(scope: Scope, id: string): Promise<SessionRow> {
    const where = this.sessionWhere(scope, id);
    const [locked] = await this.db.tx.select().from(workoutSessions).where(where).for("update");
    if (locked) return locked;
    const [row] = await this.db.tx.select().from(workoutSessions).where(where);
    if (!row) throw notFound();
    return row;
  }

  private async lockInProgress(scope: Scope, id: string): Promise<SessionRow> {
    const session = await this.lock(scope, id);
    if (session.status !== "in_progress") {
      throw notInProgress(session.status as WorkoutSessionStatus);
    }
    return session;
  }

  /** The session exercise (in this workspace) and its workout, locked. */
  private async lockExercise(scope: Scope, sessionExerciseId: string) {
    const [row] = await this.db.tx
      .select()
      .from(workoutSessionExercises)
      .where(
        and(
          eq(workoutSessionExercises.id, sessionExerciseId),
          eq(workoutSessionExercises.workspaceId, scope.workspaceId),
        ),
      );
    if (!row) throw DomainError.notFound("That exercise isn't part of this workout.");
    await this.lockInProgress(scope, row.workoutSessionId);
    return row;
  }

  /** Library exercises by id, with whether they may be used now (global or own, not archived). */
  private async exerciseRows(scope: Scope, ids: string[]): Promise<Map<string, ExerciseRow>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.tx
      .select({
        id: exercises.id,
        name: exercises.name,
        category: exercises.category,
        muscleGroups: exercises.muscleGroups,
        equipment: exercises.equipment,
        mediaUrl: exercises.mediaUrl,
        substitutionIds: exercises.substitutionIds,
        usable: sql<boolean>`${exercises.archivedAt} is null`,
      })
      .from(exercises)
      .where(
        and(
          inArray(exercises.id, [...new Set(ids)]),
          or(isNull(exercises.workspaceId), eq(exercises.workspaceId, scope.workspaceId)),
        ),
      );
    return new Map(rows.map((row) => [row.id, row]));
  }

  private async usableExercise(scope: Scope, id: string): Promise<ExerciseRow> {
    const row = (await this.exerciseRows(scope, [id])).get(id);
    if (!row || !row.usable)
      throw invalid({ exerciseId: ["Choose an exercise from your library"] });
    return row;
  }

  private snapshotWorkout(snapshot: unknown, index: number) {
    const workout = (snapshot as ProgramDetail).workouts?.[index];
    if (!workout) throw new Error(`assignment snapshot has no workout ${index}`);
    return workout;
  }

  async get(id: string): Promise<WorkoutDetail> {
    return this.detail(this.scope(), id);
  }

  private async detail(scope: Scope, id: string): Promise<WorkoutDetail> {
    const [row] = await this.db.tx
      .select({
        session: workoutSessions,
        clientName: clients.fullName,
        clientStatus: clients.status,
        programName: clientProgramAssignments.name,
        snapshot: clientProgramAssignments.programSnapshot,
        instructions: clientProgramAssignments.instructions,
        equipmentNotes: clientProgramAssignments.equipmentNotes,
        appointmentStatus: appointments.status,
        appointmentStartsAt: appointments.startsAt,
      })
      .from(workoutSessions)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, workoutSessions.workspaceId),
          eq(clients.id, workoutSessions.clientId),
        ),
      )
      .innerJoin(
        clientProgramAssignments,
        and(
          eq(clientProgramAssignments.workspaceId, workoutSessions.workspaceId),
          eq(clientProgramAssignments.id, workoutSessions.assignmentId),
        ),
      )
      .leftJoin(
        appointments,
        and(
          eq(appointments.workspaceId, workoutSessions.workspaceId),
          eq(appointments.id, workoutSessions.appointmentId),
        ),
      )
      .where(this.sessionWhere(scope, id));
    if (!row) throw notFound();
    const { session } = row;
    const planned = this.snapshotWorkout(row.snapshot, session.workoutIndex);

    const logged = await this.db.tx
      .select()
      .from(workoutSessionExercises)
      .where(
        and(
          eq(workoutSessionExercises.workspaceId, scope.workspaceId),
          eq(workoutSessionExercises.workoutSessionId, session.id),
        ),
      )
      .orderBy(asc(workoutSessionExercises.position));
    // Before it starts (or when skipped unstarted), the workout is shown as planned.
    const plan: PlanRow[] =
      logged.length > 0
        ? logged
        : planned.exercises.map((item: SnapshotExercise, index) => ({
            id: null,
            position: index + 1,
            exerciseId: item.exercise.id,
            plannedExerciseId: item.exercise.id,
            sets: item.sets,
            repsMin: item.repsMin,
            repsMax: item.repsMax,
            durationSeconds: item.durationSeconds,
            targetLoadKg: item.targetLoadKg,
            restSeconds: item.restSeconds,
            trainerNotes: item.trainerNotes,
            clientInstructions: item.clientInstructions,
          }));

    const sets =
      logged.length > 0
        ? await this.db.tx
            .select()
            .from(workoutSets)
            .where(
              and(
                eq(workoutSets.workspaceId, scope.workspaceId),
                inArray(
                  workoutSets.workoutSessionExerciseId,
                  logged.map((item) => item.id),
                ),
              ),
            )
            .orderBy(asc(workoutSets.setNumber))
        : [];
    const setsByExercise = new Map<string, WorkoutSet[]>();
    for (const set of sets) {
      const list = setsByExercise.get(set.workoutSessionExerciseId) ?? [];
      list.push({
        id: set.id,
        setNumber: set.setNumber,
        reps: set.reps,
        loadKg: set.loadKg,
        durationSeconds: set.durationSeconds,
        rpe: set.rpe,
        completed: set.completed,
        completedAt: set.completedAt?.toISOString() ?? null,
      });
      setsByExercise.set(set.workoutSessionExerciseId, list);
    }

    const library = await this.exerciseRows(
      scope,
      plan.flatMap((item) => [item.exerciseId, item.plannedExerciseId ?? item.exerciseId]),
    );
    const suggestionIds = plan.flatMap(
      (item) => library.get(item.plannedExerciseId ?? item.exerciseId)?.substitutionIds ?? [],
    );
    const suggestions = await this.exerciseRows(scope, suggestionIds);
    const ref = (exerciseId: string) => ({
      id: exerciseId,
      name: library.get(exerciseId)?.name ?? "Exercise",
    });

    const items: WorkoutExercise[] = plan.map((item) => {
      const current = library.get(item.exerciseId);
      const setsLogged = item.id ? (setsByExercise.get(item.id) ?? []) : [];
      const completed = setsLogged.filter((set) => set.completed).length;
      const basis = library.get(item.plannedExerciseId ?? item.exerciseId);
      return {
        id: item.id,
        position: item.position,
        exercise: {
          ...ref(item.exerciseId),
          category: (current?.category ?? "strength") as ExerciseCategory,
          muscleGroups: (current?.muscleGroups ?? []) as MuscleGroup[],
          equipment: (current?.equipment ?? []) as Equipment[],
          mediaUrl: current?.mediaUrl ?? null,
        },
        substitutedFor:
          item.plannedExerciseId && item.plannedExerciseId !== item.exerciseId
            ? ref(item.plannedExerciseId)
            : null,
        added: item.plannedExerciseId === null,
        substitutions: (basis?.substitutionIds ?? []).flatMap((substitutionId) => {
          const option = suggestions.get(substitutionId);
          return option?.usable && option.id !== item.exerciseId
            ? [{ id: option.id, name: option.name }]
            : [];
        }),
        sets: item.sets,
        repsMin: item.repsMin,
        repsMax: item.repsMax,
        durationSeconds: item.durationSeconds,
        targetLoadKg: item.targetLoadKg,
        restSeconds: item.restSeconds,
        trainerNotes: item.trainerNotes,
        clientInstructions: item.clientInstructions,
        logged: setsLogged,
        done: completed >= item.sets,
      };
    });

    const completedSets = items.flatMap((item) => item.logged.filter((set) => set.completed));
    const volume = completedSets.reduce(
      (total, set) => total + (set.reps ?? 0) * (set.loadKg ?? 0),
      0,
    );
    const end = session.completedAt ?? (session.status === "in_progress" ? new Date() : null);
    const startsAt = row.appointmentStartsAt;
    return {
      id: session.id,
      name: session.name,
      scheduledOn: session.scheduledOn,
      status: session.status as WorkoutSessionStatus,
      startedAt: session.startedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      feedback: session.trainerFeedback,
      clientFeedback: session.clientFeedback,
      skipReason: session.skipReason,
      client: {
        id: session.clientId,
        fullName: row.clientName,
        active: row.clientStatus === "active",
      },
      program: {
        name: row.programName,
        notes: planned.notes,
        instructions: row.instructions,
        equipmentNotes: row.equipmentNotes,
      },
      appointment:
        session.appointmentId && startsAt && row.appointmentStatus
          ? {
              id: session.appointmentId,
              status: row.appointmentStatus as AppointmentStatus,
              startsAt: startsAt.toISOString(),
              started: startsAt.getTime() <= Date.now(),
            }
          : null,
      exercises: items,
      summary: {
        exercisesTotal: items.length,
        exercisesDone: items.filter((item) => item.done).length,
        setsPlanned: items.reduce((total, item) => total + item.sets, 0),
        setsCompleted: completedSets.length,
        volumeKg: Math.round(volume * 100) / 100,
        durationMinutes:
          session.startedAt && end
            ? Math.max(0, Math.round((end.getTime() - session.startedAt.getTime()) / 60_000))
            : null,
        estimatedMinutes: estimateMinutes(items),
      },
    };
  }

  /**
   * planned → in_progress: copy the snapshot's exercises and link the client's appointment of the
   * day (the nearest one not linked to another workout). Starting again returns the same workout.
   */
  async start(id: string): Promise<WorkoutDetail> {
    const scope = this.scope();
    const session = await this.lock(scope, id);
    if (session.status === "in_progress") return this.detail(scope, id);
    if (session.status !== "planned") throw notInProgress(session.status as WorkoutSessionStatus);

    const [owner] = await this.db.tx
      .select({
        status: clients.status,
        fullName: clients.fullName,
        snapshot: clientProgramAssignments.programSnapshot,
      })
      .from(clients)
      .innerJoin(
        clientProgramAssignments,
        and(
          eq(clientProgramAssignments.workspaceId, clients.workspaceId),
          eq(clientProgramAssignments.id, session.assignmentId),
        ),
      )
      .where(and(eq(clients.workspaceId, scope.workspaceId), eq(clients.id, session.clientId)));
    if (!owner) throw notFound();
    if (owner.status !== "active") {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        `${owner.fullName} isn't an active client, so this workout can't start.`,
      );
    }
    const planned = this.snapshotWorkout(owner.snapshot, session.workoutIndex);

    const [appointment] = await this.db.tx
      .select({ id: appointments.id })
      .from(appointments)
      .innerJoin(workspaces, eq(workspaces.id, appointments.workspaceId))
      .where(
        and(
          eq(appointments.workspaceId, scope.workspaceId),
          eq(appointments.clientId, session.clientId),
          inArray(appointments.kind, ["session", "online_session"]),
          sql`${appointments.status} <> 'cancelled'`,
          sql`(${appointments.startsAt} at time zone ${workspaces.timezone})::date
            = (now() at time zone ${workspaces.timezone})::date`,
          sql`not exists (
            select 1 from ${workoutSessions} other where other.appointment_id = ${appointments.id}
          )`,
        ),
      )
      .orderBy(sql`abs(extract(epoch from ${appointments.startsAt} - now()))`)
      .limit(1);

    // The session must be in progress before its exercises can be written (RLS, migration 0029).
    await this.db.tx
      .update(workoutSessions)
      .set({ status: "in_progress", startedAt: sql`now()`, appointmentId: appointment?.id ?? null })
      .where(this.sessionWhere(scope, id));
    if (planned.exercises.length > 0) {
      await this.db.tx.insert(workoutSessionExercises).values(
        planned.exercises.map((item: SnapshotExercise, index) => ({
          workspaceId: scope.workspaceId,
          workoutSessionId: id,
          position: index + 1,
          exerciseId: item.exercise.id,
          plannedExerciseId: item.exercise.id,
          sets: item.sets,
          repsMin: item.repsMin,
          repsMax: item.repsMax,
          durationSeconds: item.durationSeconds,
          targetLoadKg: item.targetLoadKg,
          restSeconds: item.restSeconds,
          trainerNotes: item.trainerNotes,
          clientInstructions: item.clientInstructions,
        })),
      );
    }
    return this.detail(scope, id);
  }

  /**
   * Idempotent upsert of one set. The same id always means the same set; if the device lost its id
   * (e.g. a refresh before the response arrived), a set with the same number is updated instead of
   * duplicated.
   */
  async putSet(setId: string, input: PutWorkoutSetRequest): Promise<WorkoutDetail> {
    const scope = this.scope();
    const exercise = await this.lockExercise(scope, input.sessionExerciseId);

    const [byId] = await this.db.tx
      .select()
      .from(workoutSets)
      .where(and(eq(workoutSets.id, setId), eq(workoutSets.workspaceId, scope.workspaceId)));
    if (
      byId &&
      (byId.workoutSessionExerciseId !== exercise.id || byId.setNumber !== input.setNumber)
    ) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "This set was saved as a different set. Reload the workout.",
      );
    }
    const [byNumber] = byId
      ? [byId]
      : await this.db.tx
          .select()
          .from(workoutSets)
          .where(
            and(
              eq(workoutSets.workspaceId, scope.workspaceId),
              eq(workoutSets.workoutSessionExerciseId, exercise.id),
              eq(workoutSets.setNumber, input.setNumber),
            ),
          );

    const values = {
      reps: input.reps,
      loadKg: input.loadKg,
      durationSeconds: input.durationSeconds,
      rpe: input.rpe,
      completed: input.completed,
      completedAt: input.completed ? (byNumber?.completedAt ?? sql`now()`) : null,
    };
    if (byNumber) {
      await this.db.tx
        .update(workoutSets)
        .set(values)
        .where(
          and(eq(workoutSets.id, byNumber.id), eq(workoutSets.workspaceId, scope.workspaceId)),
        );
    } else {
      const [last] = await this.db.tx
        .select({ value: max(workoutSets.setNumber) })
        .from(workoutSets)
        .where(
          and(
            eq(workoutSets.workspaceId, scope.workspaceId),
            eq(workoutSets.workoutSessionExerciseId, exercise.id),
          ),
        );
      if (input.setNumber > Math.max(last?.value ?? 0, exercise.sets) + 1) {
        throw invalid({ setNumber: ["Log the earlier sets first"] });
      }
      await this.db.tx.insert(workoutSets).values({
        id: setId,
        workspaceId: scope.workspaceId,
        workoutSessionExerciseId: exercise.id,
        setNumber: input.setNumber,
        ...values,
      });
    }
    return this.detail(scope, exercise.workoutSessionId);
  }

  /** Swap an exercise for another (logged sets stay); the planned one is kept for the record. */
  async substitute(
    sessionExerciseId: string,
    input: SubstituteExerciseRequest,
  ): Promise<WorkoutDetail> {
    const scope = this.scope();
    this.trainerOnly(scope);
    const item = await this.lockExercise(scope, sessionExerciseId);
    if (item.exerciseId !== input.exerciseId) {
      await this.usableExercise(scope, input.exerciseId);
      await this.db.tx
        .update(workoutSessionExercises)
        .set({ exerciseId: input.exerciseId })
        .where(
          and(
            eq(workoutSessionExercises.id, item.id),
            eq(workoutSessionExercises.workspaceId, scope.workspaceId),
          ),
        );
    }
    return this.detail(scope, item.workoutSessionId);
  }

  /** An extra exercise at the end of the workout (not added to the program). */
  async addExercise(id: string, input: AddWorkoutExerciseRequest): Promise<WorkoutDetail> {
    const scope = this.scope();
    this.trainerOnly(scope);
    await this.lockInProgress(scope, id);
    await this.usableExercise(scope, input.exerciseId);
    const [last] = await this.db.tx
      .select({ value: max(workoutSessionExercises.position) })
      .from(workoutSessionExercises)
      .where(
        and(
          eq(workoutSessionExercises.workspaceId, scope.workspaceId),
          eq(workoutSessionExercises.workoutSessionId, id),
        ),
      );
    const position = (last?.value ?? 0) + 1;
    if (position > WORKOUT_EXERCISES_LOGGED_MAX) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        `A workout can have at most ${WORKOUT_EXERCISES_LOGGED_MAX} exercises.`,
      );
    }
    await this.db.tx.insert(workoutSessionExercises).values({
      workspaceId: scope.workspaceId,
      workoutSessionId: id,
      position,
      exerciseId: input.exerciseId,
      plannedExerciseId: null,
      sets: input.sets,
      repsMin: input.repsMin,
      repsMax: input.repsMax,
      durationSeconds: input.durationSeconds,
      targetLoadKg: input.targetLoadKg,
      restSeconds: input.restSeconds,
      trainerNotes: input.trainerNotes || null,
      clientInstructions: input.clientInstructions || null,
    });
    return this.detail(scope, id);
  }

  finish(
    id: string,
    input: FinishWorkoutRequest,
    idempotencyKey: string | undefined,
  ): Promise<WorkoutDetail> {
    return this.idempotency.run(
      `POST /v1/workout-sessions/${id}/finish`,
      idempotencyKey,
      input,
      () => this.runFinish(id, input),
    );
  }

  /** in_progress → completed. Needs at least one completed set; finishing twice is a no-op. */
  private async runFinish(id: string, input: FinishWorkoutRequest): Promise<WorkoutDetail> {
    const scope = this.scope();
    const session = await this.lock(scope, id);
    if (session.status === "completed") return this.detail(scope, id);
    if (session.status !== "in_progress")
      throw notInProgress(session.status as WorkoutSessionStatus);
    const [done] = await this.db.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(workoutSets)
      .innerJoin(
        workoutSessionExercises,
        and(
          eq(workoutSessionExercises.workspaceId, workoutSets.workspaceId),
          eq(workoutSessionExercises.id, workoutSets.workoutSessionExerciseId),
        ),
      )
      .where(
        and(
          eq(workoutSets.workspaceId, scope.workspaceId),
          eq(workoutSessionExercises.workoutSessionId, id),
          eq(workoutSets.completed, true),
        ),
      );
    if (!done || done.count === 0) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "No sets are completed yet. Complete a set, or skip the workout instead.",
      );
    }
    await this.db.tx
      .update(workoutSessions)
      .set({
        status: "completed",
        completedAt: sql`now()`,
        // Each side writes only their own feedback (trigger, migration 0033).
        ...(scope.actor === "client"
          ? { clientFeedback: input.feedback || null }
          : { trainerFeedback: input.feedback || null }),
      })
      .where(this.sessionWhere(scope, id));
    return this.detail(scope, id);
  }

  /** planned or in_progress → skipped (anything logged stays). Skipping twice is a no-op. */
  async skip(id: string, input: SkipWorkoutRequest): Promise<WorkoutDetail> {
    const scope = this.scope();
    this.trainerOnly(scope);
    const session = await this.lock(scope, id);
    if (session.status === "skipped") return this.detail(scope, id);
    if (session.status === "completed") throw notInProgress("completed");
    await this.db.tx
      .update(workoutSessions)
      .set({ status: "skipped", skipReason: input.reason || null })
      .where(this.sessionWhere(scope, id));
    return this.detail(scope, id);
  }
}
