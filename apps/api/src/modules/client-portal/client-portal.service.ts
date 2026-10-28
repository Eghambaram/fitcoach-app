import { Injectable } from "@nestjs/common";
import {
  type ClientAppointment,
  type ClientHomeResponse,
  type ClientMeResponse,
  type ClientPortalPackage,
  type ClientPortalScheduleResponse,
  type ClientProfileResponse,
  type ClientWorkoutResponse,
  type ClientWorkoutSummary,
  ERROR_CODES,
  type FinishWorkoutRequest,
  type FitnessGoal,
  firstName,
  type LengthUnit,
  type PackageKind,
  type PortalWorkoutsResponse,
  type PreferredContact,
  type PutWorkoutSetRequest,
  type UpdateClientPreferencesRequest,
  type WeightUnit,
  type WorkoutDetail,
  type WorkoutSessionStatus,
} from "@fitcoach/shared";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import {
  clientGoals,
  clientProgramAssignments,
  clients,
  files,
  profiles,
  workoutSessions,
  workspaceMembers,
  workspaces,
} from "../../db/schema";
import { FilesService } from "../files/files.service";
import { CheckInsService } from "../check-ins/check-ins.service";
import { ProgressService } from "../progress/progress.service";
import { WorkoutsService } from "../workouts/workouts.service";
import { readFeatures } from "./portal-access.service";

const WRITABLE = new Set(["trialing", "active", "past_due"]);
type Scope = { userId: string; clientId: string; workspaceId: string };

/** YYYY-MM-DD + n days (UTC steps, so no time zone shifts the day). */
function addDays(day: string, days: number): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
/** Monday of the week that contains `day`. */
function weekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

const selfLoggingOff = () =>
  new DomainError(
    ERROR_CODES.FORBIDDEN,
    403,
    "Your trainer logs this workout with you. Ask them if you'd like to log workouts yourself.",
  );

/**
 * The client portal's reads and the client's own writes (PROMPT §9). Runs as fitcoach_app with the
 * client's context: RLS and the client views (migration 0033) show only their own rows; queries
 * still filter by the session's client and select allow-listed columns only. Trainer notes, trainer
 * feedback, prices, payments and session notes never leave this service.
 */
@Injectable()
export class ClientPortalService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly files: FilesService,
    private readonly workouts: WorkoutsService,
    private readonly checkIns: CheckInsService,
    private readonly progress: ProgressService,
  ) {}

  scope(): Scope {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "client" || !auth.clientId || !auth.workspaceId) {
      throw DomainError.forbidden();
    }
    return { userId: auth.userId, clientId: auth.clientId, workspaceId: auth.workspaceId };
  }

  /** The client row and workspace basics, scoped to the session. */
  private async client(scope: Scope) {
    const [row] = await this.db.tx
      .select({
        id: clients.id,
        fullName: clients.fullName,
        email: clients.email,
        phoneE164: clients.phoneE164,
        status: clients.status,
        preferredContact: clients.preferredContact,
        weightUnit: clients.weightUnit,
        lengthUnit: clients.lengthUnit,
        features: clients.features,
        workspaceName: workspaces.name,
        timezone: workspaces.timezone,
        workspaceStatus: workspaces.status,
        today: sql<string>`(now() at time zone ${workspaces.timezone})::date::text`,
      })
      .from(clients)
      .innerJoin(workspaces, eq(workspaces.id, clients.workspaceId))
      .where(and(eq(clients.id, scope.clientId), eq(clients.workspaceId, scope.workspaceId)));
    if (!row) throw DomainError.forbidden();
    return row;
  }

  async me(): Promise<ClientMeResponse> {
    const scope = this.scope();
    const row = await this.client(scope);
    const [trainer] = await this.db.tx
      .select({
        displayName: profiles.displayName,
        phoneE164: profiles.phoneE164,
        avatarKey: files.objectKey,
      })
      .from(workspaceMembers)
      .innerJoin(profiles, eq(profiles.userId, workspaceMembers.userId))
      .leftJoin(files, eq(files.id, profiles.avatarFileId))
      .where(eq(workspaceMembers.workspaceId, scope.workspaceId))
      .limit(1);
    return {
      client: { id: row.id, fullName: row.fullName, firstName: firstName(row.fullName) },
      trainer: {
        displayName: trainer?.displayName ?? row.workspaceName,
        avatarUrl: this.files.avatarUrl(trainer?.avatarKey ?? null),
        phoneE164: trainer?.phoneE164 ?? null,
      },
      features: readFeatures(row.features),
      workspace: {
        name: row.workspaceName,
        timezone: row.timezone,
        readOnly: !WRITABLE.has(row.workspaceStatus),
      },
    };
  }

  // -------------------------------------------------------------------------------------------
  // Shared pieces
  // -------------------------------------------------------------------------------------------

  private async sessions(
    scope: Scope,
    where: ReturnType<typeof sql>,
    order: "asc" | "desc",
    limit: number,
  ): Promise<ClientWorkoutSummary[]> {
    const rows = await this.db.tx
      .select({
        id: workoutSessions.id,
        name: workoutSessions.name,
        scheduledOn: workoutSessions.scheduledOn,
        status: workoutSessions.status,
      })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.workspaceId, scope.workspaceId),
          eq(workoutSessions.clientId, scope.clientId),
          where,
        ),
      )
      .orderBy(
        order === "asc" ? asc(workoutSessions.scheduledOn) : desc(workoutSessions.scheduledOn),
        asc(workoutSessions.workoutIndex),
      )
      .limit(limit);
    return rows.map((row) => ({ ...row, status: row.status as WorkoutSessionStatus }));
  }

  /** Appointments from the notes-free client view (migration 0033), in the workspace time zone. */
  private async appointments(
    scope: Scope,
    timezone: string,
    where: ReturnType<typeof sql>,
    order: "asc" | "desc",
    limit: number,
  ): Promise<ClientAppointment[]> {
    const result = await this.db.tx.execute<{
      id: string;
      kind: ClientAppointment["kind"];
      status: ClientAppointment["status"];
      starts_at: string;
      date: string;
      start_time: string;
      end_time: string;
      duration_min: number;
      location: string | null;
      meeting_url: string | null;
    }>(sql`
      select id, kind, status, starts_at,
        to_char(starts_at at time zone ${timezone}, 'YYYY-MM-DD') as date,
        to_char(starts_at at time zone ${timezone}, 'HH24:MI') as start_time,
        to_char(ends_at at time zone ${timezone}, 'HH24:MI') as end_time,
        duration_min, location, meeting_url
      from client_portal_appointments
      where client_id = ${scope.clientId} and workspace_id = ${scope.workspaceId} and ${where}
      order by starts_at ${order === "asc" ? sql`asc` : sql`desc`}
      limit ${limit}`);
    return result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      startsAt: new Date(row.starts_at).toISOString(),
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
      durationMin: Number(row.duration_min),
      location: row.location,
      meetingUrl: row.meeting_url,
    }));
  }

  /** The active package from the price-free client view (rule 20c). */
  private async activePackage(scope: Scope): Promise<ClientPortalPackage | null> {
    const result = await this.db.tx.execute<{
      name: string;
      kind: PackageKind;
      sessions_left: number | null;
      sessions_included: number | null;
      expires_on: string | null;
    }>(sql`
      select name, kind, sessions_left, sessions_included, expires_on::text
      from client_portal_packages
      where client_id = ${scope.clientId} and workspace_id = ${scope.workspaceId}
        and status = 'active'
      order by created_at desc
      limit 1`);
    const row = result.rows[0];
    return row
      ? {
          name: row.name,
          kind: row.kind,
          sessionsLeft: row.sessions_left === null ? null : Number(row.sessions_left),
          sessionsIncluded: row.sessions_included === null ? null : Number(row.sessions_included),
          expiresOn: row.expires_on,
        }
      : null;
  }

  // -------------------------------------------------------------------------------------------
  // Home
  // -------------------------------------------------------------------------------------------

  async home(): Promise<ClientHomeResponse> {
    const scope = this.scope();
    const client = await this.client(scope);
    const today = client.today;
    const monday = weekStart(today);
    const sunday = addDays(monday, 6);

    const week = await this.sessions(
      scope,
      sql`${workoutSessions.scheduledOn} between ${monday} and ${sunday}`,
      "asc",
      30,
    );
    const weekSessions = await this.appointments(
      scope,
      client.timezone,
      sql`status <> 'cancelled' and (starts_at at time zone ${client.timezone})::date between ${monday}::date and ${sunday}::date`,
      "asc",
      30,
    );
    const [next] = await this.appointments(
      scope,
      client.timezone,
      sql`status in ('scheduled', 'confirmed') and ends_at >= now()`,
      "asc",
      1,
    );
    const todays = week.filter((item) => item.scheduledOn === today);
    const [program] = await this.db.tx
      .select({ name: clientProgramAssignments.name })
      .from(clientProgramAssignments)
      .where(
        and(
          eq(clientProgramAssignments.workspaceId, scope.workspaceId),
          eq(clientProgramAssignments.clientId, scope.clientId),
          eq(clientProgramAssignments.status, "active"),
        ),
      );

    return {
      today,
      week: Array.from({ length: 7 }, (_, index) => {
        const date = addDays(monday, index);
        return {
          date,
          workouts: week.filter((item) => item.scheduledOn === date),
          sessions: weekSessions.filter((item) => item.date === date).length,
        };
      }),
      todayWorkout:
        todays.find((item) => item.status === "in_progress" || item.status === "planned") ??
        todays[0] ??
        null,
      nextSession: next ?? null,
      package: await this.activePackage(scope),
      streakWeeks: await this.streak(scope, monday, today),
      checkInDue: (await this.checkIns.clientState(scope)).due,
      sharedMetrics: await this.progress.sharedTiles(),
      programName: program?.name ?? null,
    };
  }

  /**
   * Consecutive weeks in which every planned workout was completed: counted back from last week,
   * plus this week once it is all done. A week with nothing planned ends the streak.
   */
  private async streak(scope: Scope, monday: string, today: string): Promise<number> {
    const since = addDays(monday, -7 * 26);
    const rows = await this.db.tx
      .select({ scheduledOn: workoutSessions.scheduledOn, status: workoutSessions.status })
      .from(workoutSessions)
      .where(
        and(
          eq(workoutSessions.workspaceId, scope.workspaceId),
          eq(workoutSessions.clientId, scope.clientId),
          sql`${workoutSessions.scheduledOn} between ${since} and ${addDays(monday, 6)}`,
        ),
      );
    const weekDone = (start: string, upTo?: string) => {
      const items = rows.filter(
        (row) =>
          row.scheduledOn >= start &&
          row.scheduledOn <= addDays(start, 6) &&
          (upTo === undefined || row.scheduledOn <= upTo),
      );
      return items.length > 0 && items.every((row) => row.status === "completed");
    };
    let streak = 0;
    const thisWeek = rows.filter((row) => row.scheduledOn >= monday);
    if (thisWeek.length > 0 && thisWeek.every((row) => row.status === "completed")) streak += 1;
    for (let start = addDays(monday, -7); start >= since; start = addDays(start, -7)) {
      if (!weekDone(start, today)) break;
      streak += 1;
    }
    return streak;
  }

  // -------------------------------------------------------------------------------------------
  // Workouts
  // -------------------------------------------------------------------------------------------

  async workoutList(): Promise<PortalWorkoutsResponse> {
    const scope = this.scope();
    const { today } = await this.client(scope);
    return {
      today,
      upcoming: await this.sessions(
        scope,
        sql`${workoutSessions.scheduledOn} >= ${today} and ${workoutSessions.status} in ('planned', 'in_progress')`,
        "asc",
        30,
      ),
      past: await this.sessions(
        scope,
        sql`(${workoutSessions.scheduledOn} < ${today} or ${workoutSessions.status} in ('completed', 'skipped'))`,
        "desc",
        30,
      ),
    };
  }

  /** The client's view of a workout: trainer notes and trainer-only fields removed. */
  private async present(detail: WorkoutDetail, scope: Scope): Promise<ClientWorkoutResponse> {
    const client = await this.client(scope);
    const workout: WorkoutDetail = {
      ...detail,
      feedback: null,
      appointment: null,
      exercises: detail.exercises.map((item) => ({
        ...item,
        trainerNotes: null,
        substitutions: [],
      })),
    };
    return {
      workout,
      canLog:
        readFeatures(client.features).workoutSelfLogging &&
        client.status === "active" &&
        (detail.status === "planned" || detail.status === "in_progress"),
    };
  }

  private async requireSelfLogging(scope: Scope): Promise<void> {
    const client = await this.client(scope);
    if (!readFeatures(client.features).workoutSelfLogging) throw selfLoggingOff();
  }

  async workout(id: string): Promise<ClientWorkoutResponse> {
    const scope = this.scope();
    return this.present(await this.workouts.get(id), scope);
  }

  async startWorkout(id: string): Promise<ClientWorkoutResponse> {
    const scope = this.scope();
    await this.requireSelfLogging(scope);
    return this.present(await this.workouts.start(id), scope);
  }

  async putSet(setId: string, input: PutWorkoutSetRequest): Promise<ClientWorkoutResponse> {
    const scope = this.scope();
    await this.requireSelfLogging(scope);
    return this.present(await this.workouts.putSet(setId, input), scope);
  }

  async finishWorkout(
    id: string,
    input: FinishWorkoutRequest,
    idempotencyKey: string | undefined,
  ): Promise<ClientWorkoutResponse> {
    const scope = this.scope();
    await this.requireSelfLogging(scope);
    return this.present(await this.workouts.finish(id, input, idempotencyKey), scope);
  }

  // -------------------------------------------------------------------------------------------
  // Schedule and profile
  // -------------------------------------------------------------------------------------------

  async schedule(): Promise<ClientPortalScheduleResponse> {
    const scope = this.scope();
    const client = await this.client(scope);
    return {
      today: client.today,
      timezone: client.timezone,
      upcoming: await this.appointments(
        scope,
        client.timezone,
        sql`status in ('scheduled', 'confirmed') and ends_at >= now()`,
        "asc",
        30,
      ),
      past: await this.appointments(
        scope,
        client.timezone,
        sql`(ends_at < now() or status not in ('scheduled', 'confirmed'))`,
        "desc",
        20,
      ),
    };
  }

  async profile(): Promise<ClientProfileResponse> {
    const scope = this.scope();
    const client = await this.client(scope);
    const defaults = await this.db.tx.execute<{ weight_unit: WeightUnit; length_unit: LengthUnit }>(
      sql`select * from app.client_default_units()`,
    );
    const goals = await this.db.tx
      .select({
        goal: clientGoals.goal,
        kind: clientGoals.kind,
        targetText: clientGoals.targetText,
        targetDate: clientGoals.targetDate,
      })
      .from(clientGoals)
      .where(
        and(
          eq(clientGoals.workspaceId, scope.workspaceId),
          eq(clientGoals.clientId, scope.clientId),
          eq(clientGoals.status, "active"),
        ),
      )
      .orderBy(sql`${clientGoals.kind} = 'primary' desc`, asc(clientGoals.createdAt));
    return {
      fullName: client.fullName,
      email: client.email,
      phoneE164: client.phoneE164,
      preferredContact: client.preferredContact as PreferredContact | null,
      units: {
        weightUnit: (client.weightUnit ?? defaults.rows[0]?.weight_unit ?? "kg") as WeightUnit,
        lengthUnit: (client.lengthUnit ?? defaults.rows[0]?.length_unit ?? "cm") as LengthUnit,
      },
      goals: goals.map((goal) => ({
        goal: goal.goal as FitnessGoal,
        targetText: goal.targetText,
        targetDate: goal.targetDate,
        primary: goal.kind === "primary",
      })),
      package: await this.activePackage(scope),
    };
  }

  /** Only contact preference and units, through the narrow DB function (migration 0033). */
  async updatePreferences(input: UpdateClientPreferencesRequest): Promise<ClientProfileResponse> {
    this.scope();
    await this.db.tx.execute(
      sql`select app.client_update_preferences(${input.preferredContact}, ${input.weightUnit}, ${input.lengthUnit})`,
    );
    return this.profile();
  }
}
