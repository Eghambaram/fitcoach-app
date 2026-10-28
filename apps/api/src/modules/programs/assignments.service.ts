import { Injectable } from "@nestjs/common";
import {
  type AssignProgramRequest,
  type AssignProgramResponse,
  type Assignment,
  type AssignmentStatus,
  type ClientWorkoutsResponse,
  ERROR_CODES,
  SESSION_WINDOW_DAYS,
  type WorkoutSession,
  type WorkoutSessionStatus,
} from "@fitcoach/shared";
import { and, asc, desc, eq, gte, inArray, lt, or, type SQL, sql } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import { DomainError } from "../../common/errors/domain-error";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { DbContext } from "../../db/db-context";
import type { Tx } from "../../db/database";
import { clientProgramAssignments, clients, workoutSessions, workspaces } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { JobsService } from "../jobs/jobs.service";
import { notify } from "../notifications/notify";
import { trackEvent } from "../product-events/track";
import { ProgramsService, type Trainer } from "./programs.service";

type AssignmentRow = typeof clientProgramAssignments.$inferSelect;
type ScheduleSlot = { workout_index: number; weekday: number; name: string };

const assignmentNotFound = () => DomainError.notFound("That program assignment doesn't exist.");

/** YYYY-MM-DD + n days (UTC steps, so no time zone shifts the day). */
function addDays(day: string, days: number): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Inserts the planned sessions an active assignment is missing, from today (workspace time zone) or
 * its start, up to SESSION_WINDOW_DAYS ahead or its end. Idempotent (unique slot, ON CONFLICT).
 */
async function planSessions(tx: Tx, where: SQL): Promise<number> {
  const result = await tx.execute(sql`
    insert into ${workoutSessions}
      (workspace_id, client_id, assignment_id, workout_index, name, scheduled_on)
    select a.workspace_id, a.client_id, a.id, s.workout_index, s.name, d::date
    from ${clientProgramAssignments} a
    join ${workspaces} w on w.id = a.workspace_id
    cross join lateral jsonb_to_recordset(a.schedule) as s(workout_index int, weekday int, name text)
    cross join lateral generate_series(
      greatest(a.starts_on, (now() at time zone w.timezone)::date),
      least(a.ends_on, (now() at time zone w.timezone)::date + ${SESSION_WINDOW_DAYS - 1}::int),
      interval '1 day'
    ) as d
    where a.status = 'active' and extract(isodow from d) = s.weekday and ${where}
    on conflict (assignment_id, scheduled_on, workout_index) do nothing`);
  return result.rowCount ?? 0;
}

/**
 * Program assignment and planned sessions (PROMPT §8.5). Assigning is one transaction (rule 14):
 * lock the client, end their current program (removing its future planned sessions), store a
 * snapshot of the program and plan the rolling window. A daily job keeps the window rolling and
 * completes programs that have ended.
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly db: DbContext,
    private readonly programs: ProgramsService,
    private readonly idempotency: IdempotencyService,
    private readonly systemDb: SystemDb,
    private readonly logger: PinoLogger,
    jobs: JobsService,
  ) {
    this.logger.setContext(AssignmentsService.name);
    jobs.registerRecurring({
      name: "workouts.plan-window",
      // 00:30 UTC (06:00 IST): before the day starts in the beta's time zone.
      cron: "30 0 * * *",
      handler: async () => {
        await this.extendWindows();
      },
    });
  }

  private async today(trainer: Trainer): Promise<string> {
    const [row] = await this.db.tx
      .select({ today: sql<string>`(now() at time zone ${workspaces.timezone})::date::text` })
      .from(workspaces)
      .where(eq(workspaces.id, trainer.workspaceId));
    if (!row) throw DomainError.forbidden();
    return row.today;
  }

  private toAssignment(row: AssignmentRow): Assignment {
    const schedule = (row.schedule as ScheduleSlot[]).map((slot) => ({
      workoutIndex: slot.workout_index,
      name: slot.name,
      weekday: slot.weekday,
    }));
    return {
      id: row.id,
      programId: row.programId,
      name: row.name,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      status: row.status as AssignmentStatus,
      schedule,
      instructions: row.instructions,
      equipmentNotes: row.equipmentNotes,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Ends an active assignment and removes its planned sessions from today on. */
  private async endAssignment(trainer: Trainer, id: string, today: string): Promise<void> {
    await this.db.tx
      .update(clientProgramAssignments)
      .set({ status: "ended", endedAt: sql`now()` })
      .where(
        and(
          eq(clientProgramAssignments.id, id),
          eq(clientProgramAssignments.workspaceId, trainer.workspaceId),
        ),
      );
    await this.db.tx
      .delete(workoutSessions)
      .where(
        and(
          eq(workoutSessions.workspaceId, trainer.workspaceId),
          eq(workoutSessions.assignmentId, id),
          eq(workoutSessions.status, "planned"),
          gte(workoutSessions.scheduledOn, today),
        ),
      );
  }

  assign(
    programId: string,
    input: AssignProgramRequest,
    idempotencyKey: string | undefined,
  ): Promise<AssignProgramResponse> {
    return this.idempotency.run(
      `POST /v1/programs/${programId}/assign`,
      idempotencyKey,
      input,
      () => this.runAssign(programId, input),
    );
  }

  private async runAssign(
    programId: string,
    input: AssignProgramRequest,
  ): Promise<AssignProgramResponse> {
    const trainer = this.programs.trainer();
    const program = await this.programs.detail(trainer, programId);
    if (program.global) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "Use the template to make your own copy, then assign that.",
      );
    }
    if (program.archived) {
      throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "Restore this program to assign it.");
    }
    const empty = program.workouts.findIndex((workout) => workout.exercises.length === 0);
    if (empty >= 0) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        `“${program.workouts[empty]?.name ?? "A workout"}” has no exercises yet. Add some before assigning.`,
      );
    }
    const indexes = input.schedule.map((slot) => slot.workoutIndex).sort((a, b) => a - b);
    if (
      indexes.length !== program.workouts.length ||
      indexes.some((value, position) => value !== position)
    ) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Pick a day for every workout.", {
        schedule: ["Pick a day for every workout"],
      });
    }

    const [client] = await this.db.tx
      .select({
        id: clients.id,
        status: clients.status,
        fullName: clients.fullName,
        userId: clients.userId,
      })
      .from(clients)
      .where(and(eq(clients.id, input.clientId), eq(clients.workspaceId, trainer.workspaceId)))
      .for("update");
    if (!client) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", {
        clientId: ["That client doesn't exist"],
      });
    }
    if (client.status !== "active") {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        `${client.fullName} isn't an active client. Finish onboarding or resume them first.`,
      );
    }

    const today = await this.today(trainer);
    const [current] = await this.db.tx
      .select()
      .from(clientProgramAssignments)
      .where(
        and(
          eq(clientProgramAssignments.workspaceId, trainer.workspaceId),
          eq(clientProgramAssignments.clientId, client.id),
          eq(clientProgramAssignments.status, "active"),
        ),
      );
    if (current) await this.endAssignment(trainer, current.id, today);

    const schedule: ScheduleSlot[] = input.schedule
      .slice()
      .sort((a, b) => a.workoutIndex - b.workoutIndex)
      .map((slot) => ({
        workout_index: slot.workoutIndex,
        weekday: slot.weekday,
        name: program.workouts[slot.workoutIndex]?.name ?? `Workout ${slot.workoutIndex + 1}`,
      }));
    const [created] = await this.db.tx
      .insert(clientProgramAssignments)
      .values({
        workspaceId: trainer.workspaceId,
        clientId: client.id,
        programId: program.id,
        name: program.name,
        programSnapshot: program,
        schedule,
        startsOn: input.startsOn,
        endsOn: addDays(input.startsOn, program.durationWeeks * 7 - 1),
        instructions: input.instructions || null,
        equipmentNotes: input.equipmentNotes || null,
        createdByUserId: trainer.userId,
      })
      .returning();
    if (!created) throw new Error("assignment insert returned no row");
    const planned = await planSessions(this.db.tx, sql`a.id = ${created.id}`);
    if (client.userId) {
      await notify(this.db.tx, {
        workspaceId: trainer.workspaceId,
        recipientUserId: client.userId,
        type: "program_assigned",
        title: `New program: ${program.name}`,
        body: `Starts ${input.startsOn}`,
        link: "/client/workouts",
        data: { assignmentId: created.id },
        dedupeKey: `program_assigned:${created.id}`,
      });
    }
    await trackEvent(this.db.tx, {
      event: "program_assigned",
      actorKind: "trainer",
      userId: trainer.userId,
      workspaceId: trainer.workspaceId,
      properties: { replaced: current !== undefined, workouts: program.workouts.length },
    });
    return {
      assignment: this.toAssignment(created),
      sessionsPlanned: planned,
      replaced: current?.name ?? null,
    };
  }

  async end(id: string): Promise<ClientWorkoutsResponse> {
    const trainer = this.programs.trainer();
    const [row] = await this.db.tx
      .select()
      .from(clientProgramAssignments)
      .where(
        and(
          eq(clientProgramAssignments.id, id),
          eq(clientProgramAssignments.workspaceId, trainer.workspaceId),
        ),
      );
    if (!row) throw assignmentNotFound();
    if (row.status !== "active") {
      throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "This program has already ended.");
    }
    await this.endAssignment(trainer, id, await this.today(trainer));
    return this.forClient(row.clientId);
  }

  /** Archiving a client ends their program (called by the clients service, same transaction). */
  async endForClient(clientId: string): Promise<void> {
    const trainer = this.programs.trainer();
    const [row] = await this.db.tx
      .select({ id: clientProgramAssignments.id })
      .from(clientProgramAssignments)
      .where(
        and(
          eq(clientProgramAssignments.workspaceId, trainer.workspaceId),
          eq(clientProgramAssignments.clientId, clientId),
          eq(clientProgramAssignments.status, "active"),
        ),
      );
    if (row) await this.endAssignment(trainer, row.id, await this.today(trainer));
  }

  /** Client detail → Workouts: the current (or latest) program and its sessions. */
  async forClient(clientId: string): Promise<ClientWorkoutsResponse> {
    const trainer = this.programs.trainer();
    const [client] = await this.db.tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, trainer.workspaceId)));
    if (!client) throw DomainError.notFound("That client doesn't exist.");
    const today = await this.today(trainer);
    const [assignment] = await this.db.tx
      .select()
      .from(clientProgramAssignments)
      .where(
        and(
          eq(clientProgramAssignments.workspaceId, trainer.workspaceId),
          eq(clientProgramAssignments.clientId, clientId),
        ),
      )
      .orderBy(
        sql`(${clientProgramAssignments.status} = 'active') desc`,
        desc(clientProgramAssignments.createdAt),
      )
      .limit(1);
    const mine = and(
      eq(workoutSessions.workspaceId, trainer.workspaceId),
      eq(workoutSessions.clientId, clientId),
    );
    const toSession = (row: typeof workoutSessions.$inferSelect): WorkoutSession => ({
      id: row.id,
      name: row.name,
      scheduledOn: row.scheduledOn,
      status: row.status as WorkoutSessionStatus,
      workoutIndex: row.workoutIndex,
    });
    const upcoming = await this.db.tx
      .select()
      .from(workoutSessions)
      .where(
        and(
          mine,
          gte(workoutSessions.scheduledOn, today),
          inArray(workoutSessions.status, ["planned", "in_progress"]),
        ),
      )
      .orderBy(asc(workoutSessions.scheduledOn), asc(workoutSessions.workoutIndex))
      .limit(14);
    const recent = await this.db.tx
      .select()
      .from(workoutSessions)
      .where(
        and(
          mine,
          or(
            lt(workoutSessions.scheduledOn, today),
            inArray(workoutSessions.status, ["completed", "skipped"]),
          ),
        ),
      )
      .orderBy(desc(workoutSessions.scheduledOn), desc(workoutSessions.workoutIndex))
      .limit(10);
    return {
      assignment: assignment ? this.toAssignment(assignment) : null,
      upcoming: upcoming.map(toSession),
      recent: recent.map(toSession),
    };
  }

  /**
   * Daily job (idempotent): complete programs whose last day has passed, then plan the missing
   * sessions of every active assignment. Runs across workspaces, so it needs fitcoach_system.
   */
  async extendWindows(): Promise<void> {
    const planned = await this.systemDb.run(
      "workouts: roll planned sessions forward",
      async (tx) => {
        await tx.execute(sql`
        update ${clientProgramAssignments} a set status = 'completed', ended_at = now()
        from ${workspaces} w
        where w.id = a.workspace_id and a.status = 'active'
          and a.ends_on < (now() at time zone w.timezone)::date`);
        return planSessions(tx, sql`true`);
      },
    );
    this.logger.info({ planned }, "planned workout sessions extended");
  }
}
