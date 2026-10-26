import { Injectable } from "@nestjs/common";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type Appointment,
  APPOINTMENT_KIND_LABELS,
  type AppointmentDetail,
  type AppointmentKind,
  type AppointmentListQuery,
  type AppointmentListResponse,
  type AppointmentStatus,
  type AttendanceRequest,
  type CancelAppointmentRequest,
  type ClientOptionsResponse,
  type ClientScheduleResponse,
  type ClientStatus,
  type CreateAppointmentRequest,
  ERROR_CODES,
  type NeedsAttendanceResponse,
  SERIES_MAX_OCCURRENCES,
  type SeriesCreatedResponse,
  type SeriesPreviewResponse,
  type SeriesRequest,
  type SessionNotesRequest,
  type UpdateAppointmentRequest,
} from "@fitcoach/shared";
import { and, asc, desc, eq, gte, inArray, lt, ne, notInArray, type SQL, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import {
  appointmentChanges,
  appointments,
  appointmentSeries,
  clients,
  leadActivities,
  leads,
  trainerSettings,
  workspaces,
} from "../../db/schema";
import { trackEvent } from "../product-events/track";
import { SessionDeductionService } from "./session-deduction.service";

type Trainer = AuthContext & { workspaceId: string };
type AppointmentRow = typeof appointments.$inferSelect;
type Conflict = { appointmentId: string; title: string; startTime: string };

const notFound = () => DomainError.notFound("That appointment doesn't exist.");
const invalid = (fieldErrors: Record<string, string[]>) =>
  new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", fieldErrors);
const conflictError = (conflict: Conflict) =>
  new DomainError(
    ERROR_CODES.CONFLICT_APPOINTMENT,
    409,
    `You already have ${conflict.title} at ${conflict.startTime}.`,
  );
const ACTIVE: readonly string[] = ACTIVE_APPOINTMENT_STATUSES;
const LEAD_KINDS: readonly AppointmentKind[] = ["trial", "consultation"];
/** Lead stages a booked trial moves forward to `trial_booked`. */
const PRE_TRIAL_STAGES = ["new", "contacted", "interested"];

/** Dates as YYYY-MM-DD strings, stepped in UTC so no time zone can shift a day. */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Calendar (PROMPT §8.6). Runs in the request transaction as fitcoach_app. Times are entered and
 * shown in the workspace time zone and stored as timestamptz. Overlaps are checked first for a
 * friendly message and enforced by the exclusion constraint. Attendance, un-marking and late
 * cancellation call the session-deduction hook in the same transaction (§8.3A, step 3.2).
 */
@Injectable()
export class AppointmentsService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly deduction: SessionDeductionService,
  ) {}

  private trainer(): Trainer {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { ...auth, workspaceId: auth.workspaceId };
  }

  private async timezone(trainer: Trainer): Promise<string> {
    const [row] = await this.db.tx
      .select({ timezone: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, trainer.workspaceId));
    if (!row) throw DomainError.forbidden();
    return row.timezone;
  }

  /** Local date + time in the workspace zone → instant. */
  private async instant(date: string, time: string, timezone: string): Promise<Date> {
    const result = await this.db.tx.execute<{ at: Date | string }>(
      sql`select ((${date}::date + ${time}::time) at time zone ${timezone}) as at`,
    );
    const at = result.rows[0]?.at;
    if (!at) throw new Error("time conversion returned nothing");
    return new Date(at);
  }

  private columns(timezone: string) {
    const local = (column: typeof appointments.startsAt | typeof appointments.endsAt) =>
      sql`${column} at time zone ${timezone}`;
    return {
      row: appointments,
      date: sql<string>`to_char(${local(appointments.startsAt)}, 'YYYY-MM-DD')`,
      startTime: sql<string>`to_char(${local(appointments.startsAt)}, 'HH24:MI')`,
      endTime: sql<string>`to_char(${local(appointments.endsAt)}, 'HH24:MI')`,
      clientName: clients.fullName,
      leadName: leads.fullName,
      started: sql<boolean>`(${appointments.startsAt} <= now())`,
      needsAttendance: sql<boolean>`(${appointments.status} in ('scheduled', 'confirmed') and ${appointments.endsAt} < now())`,
    };
  }

  private select(trainer: Trainer, timezone: string, ...conditions: SQL[]) {
    return this.db.tx
      .select(this.columns(timezone))
      .from(appointments)
      .leftJoin(
        clients,
        and(
          eq(clients.id, appointments.clientId),
          eq(clients.workspaceId, appointments.workspaceId),
        ),
      )
      .leftJoin(
        leads,
        and(eq(leads.id, appointments.leadId), eq(leads.workspaceId, appointments.workspaceId)),
      )
      .where(and(eq(appointments.workspaceId, trainer.workspaceId), ...conditions));
  }

  private toAppointment(
    item: Awaited<ReturnType<AppointmentsService["select"]>>[number],
  ): Appointment {
    const { row } = item;
    return {
      id: row.id,
      kind: row.kind as AppointmentKind,
      status: row.status as AppointmentStatus,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      durationMin: row.durationMin,
      person: row.clientId
        ? { kind: "client", id: row.clientId, fullName: item.clientName ?? "" }
        : { kind: "lead", id: row.leadId ?? "", fullName: item.leadName ?? "" },
      seriesId: row.seriesId,
      location: row.location,
      meetingUrl: row.meetingUrl,
      notes: row.notes,
      lateCancel: row.lateCancel,
      cancelReason: row.cancelReason,
      started: item.started,
      needsAttendance: item.needsAttendance,
    };
  }

  /** The first live appointment overlapping [start, end), other than `exclude`. */
  private async findConflict(
    trainer: Trainer,
    timezone: string,
    startsAt: Date,
    durationMin: number,
    exclude: string[] = [],
  ): Promise<Conflict | null> {
    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);
    const conditions: SQL[] = [
      inArray(appointments.status, [...ACTIVE]),
      sql`tstzrange(${appointments.startsAt}, ${appointments.endsAt}) && tstzrange(${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz)`,
    ];
    if (exclude.length > 0) conditions.push(notInArray(appointments.id, exclude));
    const [hit] = await this.select(trainer, timezone, ...conditions)
      .orderBy(asc(appointments.startsAt))
      .limit(1);
    if (!hit) return null;
    const name = hit.clientName ?? hit.leadName ?? "someone";
    const time = await this.db.tx.execute<{ label: string }>(
      sql`select to_char(${hit.row.startsAt.toISOString()}::timestamptz at time zone ${timezone}, 'FMHH12:MI AM') as label`,
    );
    return {
      appointmentId: hit.row.id,
      title: `${name} — ${APPOINTMENT_KIND_LABELS[hit.row.kind as AppointmentKind]}`,
      startTime: time.rows[0]?.label ?? hit.startTime,
    };
  }

  private async logChange(
    trainer: Trainer,
    appointmentId: string,
    kind: AppointmentDetail["changes"][number]["kind"],
    data: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db.tx.insert(appointmentChanges).values({
      workspaceId: trainer.workspaceId,
      appointmentId,
      kind,
      data,
      actorUserId: trainer.userId,
    });
  }

  private async logLead(
    trainer: Trainer,
    leadId: string,
    type: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.db.tx.insert(leadActivities).values({
      workspaceId: trainer.workspaceId,
      leadId,
      type,
      data,
      actorKind: "trainer",
      actorUserId: trainer.userId,
    });
  }

  /** Locks a live appointment; FOR UPDATE skips cancelled ones (UPDATE policy), read those plainly. */
  private async lock(trainer: Trainer, id: string): Promise<AppointmentRow> {
    const where = and(eq(appointments.id, id), eq(appointments.workspaceId, trainer.workspaceId));
    const [locked] = await this.db.tx.select().from(appointments).where(where).for("update");
    if (locked) return locked;
    const [cancelled] = await this.db.tx.select().from(appointments).where(where);
    if (!cancelled) throw notFound();
    throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "This appointment was cancelled.");
  }

  // -------------------------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------------------------

  async list(query: AppointmentListQuery): Promise<AppointmentListResponse> {
    const trainer = this.trainer();
    const timezone = await this.timezone(trainer);
    const rows = await this.select(
      trainer,
      timezone,
      sql`${appointments.startsAt} >= (${query.from}::date::timestamp at time zone ${timezone})`,
      sql`${appointments.startsAt} < ((${query.to}::date + 1)::timestamp at time zone ${timezone})`,
    ).orderBy(asc(appointments.startsAt), asc(appointments.id));
    const today = await this.db.tx.execute<{ today: string }>(
      sql`select to_char(now() at time zone ${timezone}, 'YYYY-MM-DD') as today`,
    );
    return {
      appointments: rows.map((row) => this.toAppointment(row)),
      timezone,
      today: today.rows[0]?.today ?? query.from,
    };
  }

  /** Past appointments still scheduled/confirmed (§8.6 "Mark attendance prompt"), last 60 days. */
  async needsAttendance(): Promise<NeedsAttendanceResponse> {
    const trainer = this.trainer();
    const timezone = await this.timezone(trainer);
    const rows = await this.select(
      trainer,
      timezone,
      inArray(appointments.status, [...ACTIVE]),
      lt(appointments.endsAt, sql`now()`),
      gte(appointments.startsAt, sql`now() - interval '60 days'`),
    )
      .orderBy(desc(appointments.startsAt))
      .limit(50);
    return { appointments: rows.map((row) => this.toAppointment(row)) };
  }

  async get(id: string): Promise<AppointmentDetail> {
    const trainer = this.trainer();
    const timezone = await this.timezone(trainer);
    const [row] = await this.select(trainer, timezone, eq(appointments.id, id));
    if (!row) throw notFound();
    const changes = await this.db.tx
      .select()
      .from(appointmentChanges)
      .where(
        and(
          eq(appointmentChanges.workspaceId, trainer.workspaceId),
          eq(appointmentChanges.appointmentId, id),
        ),
      )
      .orderBy(desc(appointmentChanges.createdAt), desc(appointmentChanges.id))
      .limit(100);
    return {
      ...this.toAppointment(row),
      changes: changes.map((change) => ({
        id: change.id,
        kind: change.kind as AppointmentDetail["changes"][number]["kind"],
        data: (change.data ?? {}) as Record<string, unknown>,
        createdAt: change.createdAt.toISOString(),
      })),
    };
  }

  /** A client's next 20 live sessions and last 20 others (client detail, Schedule tab). */
  async forClient(clientId: string): Promise<ClientScheduleResponse> {
    const trainer = this.trainer();
    const timezone = await this.timezone(trainer);
    const mine = eq(appointments.clientId, clientId);
    const upcoming = await this.select(
      trainer,
      timezone,
      mine,
      inArray(appointments.status, [...ACTIVE]),
      gte(appointments.startsAt, sql`now()`),
    )
      .orderBy(asc(appointments.startsAt))
      .limit(20);
    const past = await this.select(
      trainer,
      timezone,
      mine,
      sql`not (${appointments.status} in ('scheduled', 'confirmed') and ${appointments.startsAt} >= now())`,
    )
      .orderBy(desc(appointments.startsAt))
      .limit(20);
    return {
      upcoming: upcoming.map((row) => this.toAppointment(row)),
      past: past.map((row) => this.toAppointment(row)),
    };
  }

  /**
   * Archiving a client (§8.3): their future live sessions are cancelled (not late, so no session is
   * used) and their series end, in the caller's transaction. Returns how many were cancelled.
   */
  async cancelFutureForClient(clientId: string, reason: string): Promise<number> {
    const trainer = this.trainer();
    const future = await this.db.tx
      .update(appointments)
      .set({
        status: "cancelled",
        cancelledAt: sql`now()`,
        cancelReason: reason,
        lateCancel: false,
      })
      .where(
        and(
          eq(appointments.workspaceId, trainer.workspaceId),
          eq(appointments.clientId, clientId),
          inArray(appointments.status, [...ACTIVE]),
          gte(appointments.startsAt, sql`now()`),
        ),
      )
      .returning({ id: appointments.id });
    if (future.length > 0) {
      await this.db.tx.insert(appointmentChanges).values(
        future.map(({ id }) => ({
          workspaceId: trainer.workspaceId,
          appointmentId: id,
          kind: "cancelled",
          data: { reason, lateCancel: false, scope: "client_archived" },
          actorUserId: trainer.userId,
        })),
      );
    }
    await this.db.tx
      .update(appointmentSeries)
      .set({ status: "ended" })
      .where(
        and(
          eq(appointmentSeries.workspaceId, trainer.workspaceId),
          eq(appointmentSeries.clientId, clientId),
          eq(appointmentSeries.status, "active"),
        ),
      );
    return future.length;
  }

  async clientOptions(): Promise<ClientOptionsResponse> {
    const trainer = this.trainer();
    const rows = await this.db.tx
      .select({ id: clients.id, fullName: clients.fullName, status: clients.status })
      .from(clients)
      .where(and(eq(clients.workspaceId, trainer.workspaceId), ne(clients.status, "archived")))
      .orderBy(sql`lower(${clients.fullName})`)
      .limit(500);
    return { clients: rows.map((row) => ({ ...row, status: row.status as ClientStatus })) };
  }

  // -------------------------------------------------------------------------------------------
  // Booking
  // -------------------------------------------------------------------------------------------

  async create(input: CreateAppointmentRequest): Promise<AppointmentDetail> {
    const trainer = this.trainer();
    const timezone = await this.timezone(trainer);

    let lead: { id: string; stage: string } | undefined;
    if (input.clientId) {
      const [client] = await this.db.tx
        .select({ id: clients.id })
        .from(clients)
        .where(
          and(
            eq(clients.id, input.clientId),
            eq(clients.workspaceId, trainer.workspaceId),
            ne(clients.status, "archived"),
          ),
        );
      if (!client) throw invalid({ clientId: ["That client doesn't exist"] });
    } else {
      [lead] = await this.db.tx
        .select({ id: leads.id, stage: leads.stage, archivedAt: leads.archivedAt })
        .from(leads)
        .where(and(eq(leads.id, input.leadId ?? ""), eq(leads.workspaceId, trainer.workspaceId)));
      if (!lead) throw DomainError.notFound("That lead doesn't exist.");
      if (lead.stage === "converted") {
        throw new DomainError(
          ERROR_CODES.CONFLICT_STATE,
          409,
          "This lead is already a client. Book the session for the client.",
        );
      }
      if (!LEAD_KINDS.includes(input.kind)) {
        throw invalid({ kind: ["Leads can book a trial or a consultation"] });
      }
    }

    const startsAt = await this.instant(input.date, input.startTime, timezone);
    const conflict = await this.findConflict(trainer, timezone, startsAt, input.durationMin);
    if (conflict) throw conflictError(conflict);

    const [created] = await this.db.tx
      .insert(appointments)
      .values({
        workspaceId: trainer.workspaceId,
        clientId: input.clientId ?? null,
        leadId: input.leadId ?? null,
        kind: input.kind,
        startsAt,
        durationMin: input.durationMin,
        endsAt: startsAt,
        timezone,
        location: input.location || null,
        meetingUrl: input.meetingUrl || null,
        notes: input.notes || null,
        createdByUserId: trainer.userId,
      })
      .returning({ id: appointments.id });
    if (!created) throw new Error("appointment insert returned no row");
    await this.logChange(trainer, created.id, "created", {
      date: input.date,
      startTime: input.startTime,
      durationMin: input.durationMin,
    });

    if (lead && input.kind === "trial") {
      await this.logLead(trainer, lead.id, "trial_booked", {
        appointmentId: created.id,
        date: input.date,
        startTime: input.startTime,
      });
      if (PRE_TRIAL_STAGES.includes(lead.stage)) {
        await this.db.tx
          .update(leads)
          .set({ stage: "trial_booked", lostReason: null, nurtureUntil: null })
          .where(and(eq(leads.id, lead.id), eq(leads.workspaceId, trainer.workspaceId)));
        await this.logLead(trainer, lead.id, "stage_changed", {
          from: lead.stage,
          to: "trial_booked",
          automatic: true,
        });
      }
      await trackEvent(this.db.tx, {
        event: "trial_booked",
        actorKind: "trainer",
        userId: trainer.userId,
        workspaceId: trainer.workspaceId,
      });
    }
    return this.get(created.id);
  }

  /** The series' dates: weekdays from the start, until the end date or the count, at most 52. */
  private expand(input: SeriesRequest): { dates: string[]; capped: boolean } {
    const weekdays = new Set(input.weekdays);
    const limit = input.occurrenceCount ?? SERIES_MAX_OCCURRENCES;
    const lastDay = input.endsOn ?? addDays(input.startsOn, 366);
    const dates: string[] = [];
    let capped = false;
    for (let day = input.startsOn; day <= lastDay; day = addDays(day, 1)) {
      if (!weekdays.has(isoWeekday(day))) continue;
      if (dates.length === limit) {
        capped = input.occurrenceCount === undefined;
        break;
      }
      dates.push(day);
    }
    return { dates, capped };
  }

  private async seriesClient(trainer: Trainer, clientId: string): Promise<void> {
    const [client] = await this.db.tx
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.id, clientId),
          eq(clients.workspaceId, trainer.workspaceId),
          ne(clients.status, "archived"),
        ),
      );
    if (!client) throw invalid({ clientId: ["That client doesn't exist"] });
  }

  async previewSeries(input: SeriesRequest): Promise<SeriesPreviewResponse> {
    const trainer = this.trainer();
    const timezone = await this.timezone(trainer);
    await this.seriesClient(trainer, input.clientId);
    const { dates, capped } = this.expand(input);
    const occurrences: SeriesPreviewResponse["occurrences"] = [];
    for (const date of dates) {
      const startsAt = await this.instant(date, input.startTime, timezone);
      occurrences.push({
        date,
        startTime: input.startTime,
        conflict: await this.findConflict(trainer, timezone, startsAt, input.durationMin),
      });
    }
    return { occurrences, capped };
  }

  /**
   * Expands into concrete rows in this transaction. Any conflict not explicitly skipped is reported
   * per occurrence and nothing is saved (CLAUDE.md gotchas: never fail a series silently).
   */
  async createSeries(input: SeriesRequest): Promise<SeriesCreatedResponse> {
    const trainer = this.trainer();
    const timezone = await this.timezone(trainer);
    await this.seriesClient(trainer, input.clientId);
    const skip = new Set(input.skipDates);
    const { dates } = this.expand(input);
    const planned: { date: string; startsAt: Date }[] = [];
    const conflicts: string[] = [];
    for (const date of dates) {
      if (skip.has(date)) continue;
      const startsAt = await this.instant(date, input.startTime, timezone);
      const conflict = await this.findConflict(trainer, timezone, startsAt, input.durationMin);
      if (conflict)
        conflicts.push(`${date}: you already have ${conflict.title} at ${conflict.startTime}`);
      else planned.push({ date, startsAt });
    }
    if (conflicts.length > 0) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_APPOINTMENT,
        409,
        `${conflicts.length} of these sessions overlap others. Skip or move them first.`,
        { skipDates: conflicts },
      );
    }
    if (planned.length === 0) throw invalid({ weekdays: ["No sessions to create on these dates"] });

    const [series] = await this.db.tx
      .insert(appointmentSeries)
      .values({
        workspaceId: trainer.workspaceId,
        clientId: input.clientId,
        kind: input.kind,
        weekdays: input.weekdays,
        startTime: input.startTime,
        durationMin: input.durationMin,
        timezone,
        location: input.location || null,
        meetingUrl: input.meetingUrl || null,
        startsOn: input.startsOn,
        endsOn: input.endsOn ?? null,
        occurrenceCount: input.occurrenceCount ?? null,
        createdByUserId: trainer.userId,
      })
      .returning({ id: appointmentSeries.id });
    if (!series) throw new Error("series insert returned no row");

    const created = await this.db.tx
      .insert(appointments)
      .values(
        planned.map(({ startsAt }) => ({
          workspaceId: trainer.workspaceId,
          clientId: input.clientId,
          seriesId: series.id,
          kind: input.kind,
          startsAt,
          durationMin: input.durationMin,
          endsAt: startsAt,
          timezone,
          location: input.location || null,
          meetingUrl: input.meetingUrl || null,
          createdByUserId: trainer.userId,
        })),
      )
      .returning({ id: appointments.id });
    await this.db.tx.insert(appointmentChanges).values(
      created.map(({ id }, index) => ({
        workspaceId: trainer.workspaceId,
        appointmentId: id,
        kind: "created",
        data: {
          seriesId: series.id,
          date: planned[index]?.date,
          startTime: input.startTime,
          durationMin: input.durationMin,
        },
        actorUserId: trainer.userId,
      })),
    );
    return { seriesId: series.id, created: created.length, skipped: dates.length - planned.length };
  }

  // -------------------------------------------------------------------------------------------
  // Changes
  // -------------------------------------------------------------------------------------------

  /** This occurrence plus, for `following`, the later live occurrences of its series. */
  private async scope(
    trainer: Trainer,
    appointment: AppointmentRow,
    scope: "this" | "following",
  ): Promise<AppointmentRow[]> {
    if (scope === "this") return [appointment];
    if (!appointment.seriesId) {
      throw invalid({ scope: ["Only a recurring session has following occurrences"] });
    }
    return this.db.tx
      .select()
      .from(appointments)
      .where(
        and(
          eq(appointments.workspaceId, trainer.workspaceId),
          eq(appointments.seriesId, appointment.seriesId),
          inArray(appointments.status, [...ACTIVE]),
          gte(appointments.startsAt, appointment.startsAt),
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .for("update");
  }

  async update(id: string, input: UpdateAppointmentRequest): Promise<AppointmentDetail> {
    const trainer = this.trainer();
    const timezone = await this.timezone(trainer);
    const appointment = await this.lock(trainer, id);
    if (!ACTIVE.includes(appointment.status)) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "Attendance is already marked. Undo it to change the time.",
      );
    }
    const targets = await this.scope(trainer, appointment, input.scope);
    const [current] = await this.select(trainer, timezone, eq(appointments.id, id));
    if (input.scope === "following" && current && input.date !== current.date) {
      throw invalid({
        date: ["To move a session to another day, change only this occurrence"],
      });
    }

    const ids = targets.map((target) => target.id);
    const moves: { target: AppointmentRow; startsAt: Date; from: string; to: string }[] = [];
    for (const target of targets) {
      const [local] = await this.select(trainer, timezone, eq(appointments.id, target.id));
      const date = target.id === id ? input.date : (local?.date ?? input.date);
      const startsAt = await this.instant(date, input.startTime, timezone);
      const conflict = await this.findConflict(trainer, timezone, startsAt, input.durationMin, ids);
      if (conflict) {
        throw new DomainError(
          ERROR_CODES.CONFLICT_APPOINTMENT,
          409,
          `${date}: you already have ${conflict.title} at ${conflict.startTime}.`,
        );
      }
      moves.push({
        target,
        startsAt,
        from: `${local?.date} ${local?.startTime} (${target.durationMin} min)`,
        to: `${date} ${input.startTime} (${input.durationMin} min)`,
      });
    }

    for (const move of moves) {
      await this.db.tx
        .update(appointments)
        .set({
          startsAt: move.startsAt,
          durationMin: input.durationMin,
          location: input.location || null,
          meetingUrl: input.meetingUrl || null,
        })
        .where(
          and(
            eq(appointments.id, move.target.id),
            eq(appointments.workspaceId, trainer.workspaceId),
          ),
        );
      await this.logChange(trainer, move.target.id, "rescheduled", {
        from: move.from,
        to: move.to,
        scope: input.scope,
      });
    }
    if (input.scope === "following" && appointment.seriesId) {
      await this.db.tx
        .update(appointmentSeries)
        .set({
          startTime: input.startTime,
          durationMin: input.durationMin,
          location: input.location || null,
          meetingUrl: input.meetingUrl || null,
        })
        .where(
          and(
            eq(appointmentSeries.id, appointment.seriesId),
            eq(appointmentSeries.workspaceId, trainer.workspaceId),
          ),
        );
    }
    return this.get(id);
  }

  async cancel(id: string, input: CancelAppointmentRequest): Promise<AppointmentDetail> {
    const trainer = this.trainer();
    const appointment = await this.lock(trainer, id);
    if (!ACTIVE.includes(appointment.status)) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "Attendance is already marked. Undo it before cancelling.",
      );
    }
    const targets = await this.scope(trainer, appointment, input.scope);
    const [settings] = await this.db.tx
      .select({ windowHours: trainerSettings.lateCancelWindowHours })
      .from(trainerSettings)
      .where(eq(trainerSettings.workspaceId, trainer.workspaceId));
    const windowMs = (settings?.windowHours ?? 12) * 3_600_000;

    for (const target of targets) {
      // D25: a client session cancelled inside the window (or after it started) is a late cancel.
      const late = target.clientId !== null && target.startsAt.getTime() - Date.now() < windowMs;
      await this.db.tx
        .update(appointments)
        .set({
          status: "cancelled",
          cancelledAt: sql`now()`,
          cancelReason: input.reason,
          lateCancel: late,
        })
        .where(
          and(eq(appointments.id, target.id), eq(appointments.workspaceId, trainer.workspaceId)),
        );
      await this.logChange(trainer, target.id, "cancelled", {
        reason: input.reason,
        lateCancel: late,
        scope: input.scope,
      });
      if (target.clientId) {
        await this.deduction.applySessionUse({
          appointmentId: target.id,
          clientId: target.clientId,
          from: target.status as AppointmentStatus,
          to: "cancelled",
          lateCancel: late,
        });
      }
      if (target.leadId && target.kind === "trial") {
        await this.logLead(trainer, target.leadId, "trial_cancelled", {
          appointmentId: target.id,
          reason: input.reason,
        });
      }
    }
    if (input.scope === "following" && appointment.seriesId) {
      await this.db.tx
        .update(appointmentSeries)
        .set({ status: "ended" })
        .where(
          and(
            eq(appointmentSeries.id, appointment.seriesId),
            eq(appointmentSeries.workspaceId, trainer.workspaceId),
          ),
        );
    }
    return this.get(id);
  }

  /** Attended / no-show, or back to scheduled (undo). Never converts a lead (§8.2). */
  async attendance(id: string, input: AttendanceRequest): Promise<AppointmentDetail> {
    const trainer = this.trainer();
    const appointment = await this.lock(trainer, id);
    const from = appointment.status as AppointmentStatus;
    const to = input.status;
    if (from === to || (to === "scheduled" && ACTIVE.includes(from))) return this.get(id);
    if (to !== "scheduled" && appointment.startsAt.getTime() > Date.now()) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "This session hasn't started yet, so attendance can't be marked.",
      );
    }

    await this.db.tx
      .update(appointments)
      .set({ status: to, attendanceMarkedAt: to === "scheduled" ? null : sql`now()` })
      .where(and(eq(appointments.id, id), eq(appointments.workspaceId, trainer.workspaceId)));
    await this.logChange(trainer, id, "attendance", { from, to });
    if (appointment.clientId) {
      await this.deduction.applySessionUse({
        appointmentId: id,
        clientId: appointment.clientId,
        from,
        to,
        lateCancel: false,
      });
    }
    if (appointment.leadId && appointment.kind === "trial" && to !== "scheduled") {
      await this.logLead(
        trainer,
        appointment.leadId,
        to === "completed" ? "trial_completed" : "trial_no_show",
        {
          appointmentId: id,
        },
      );
    }
    return this.get(id);
  }

  async notes(id: string, input: SessionNotesRequest): Promise<AppointmentDetail> {
    const trainer = this.trainer();
    await this.lock(trainer, id);
    await this.db.tx
      .update(appointments)
      .set({ notes: input.notes || null })
      .where(and(eq(appointments.id, id), eq(appointments.workspaceId, trainer.workspaceId)));
    await this.logChange(trainer, id, "notes");
    return this.get(id);
  }
}
