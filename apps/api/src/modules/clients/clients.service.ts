import { Injectable } from "@nestjs/common";
import {
  type ClientDetail,
  type ClientListItem,
  type ClientListQuery,
  type ClientListResponse,
  type ClientSort,
  type ClientStatus,
  type ClientStatusRequest,
  type CoachingMode,
  ERROR_CODES,
  type FitnessGoal,
  type LengthUnit,
  type WeightUnit,
} from "@fitcoach/shared";
import { and, desc, eq, inArray, isNull, ne, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import {
  activityEvents,
  appointments,
  clientConsents,
  clientGoals,
  clientNotes,
  clientOnboardingDrafts,
  clients,
  measurements,
  measurementTypes,
  sessions,
  trainerSettings,
  workspaces,
} from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { PackagesService } from "../packages/packages.service";
import { AssignmentsService } from "../programs/assignments.service";
import { AppointmentsService } from "../scheduling/appointments.service";

type Trainer = AuthContext & { workspaceId: string };
type ClientRow = typeof clients.$inferSelect;

const clientNotFound = () => DomainError.notFound("That client doesn't exist.");
const badCursor = () =>
  new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "This list is out of date. Reload it.", {
    cursor: ["Invalid cursor"],
  });
const iso = (value: Date) => value.toISOString();
const isoOrNull = (value: Date | null) => (value ? value.toISOString() : null);

function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Keyset pagination per sort (sort value + id, like the leads list). */
const SORTS: Record<
  ClientSort,
  { key: SQL; direction: "asc" | "desc"; encode: (row: ClientRow) => string; cast: string }
> = {
  name: {
    key: sql`lower(${clients.fullName})`,
    direction: "asc",
    encode: (row) => row.fullName.toLowerCase(),
    cast: "text",
  },
  newest: {
    key: sql`${clients.createdAt}`,
    direction: "desc",
    encode: (row) => iso(row.createdAt),
    cast: "timestamptz",
  },
};

function encodeCursor(value: string, id: string): string {
  return Buffer.from(JSON.stringify([value, id])).toString("base64url");
}
function decodeCursor(cursor: string): [string, string] {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      typeof parsed[0] === "string" &&
      typeof parsed[1] === "string" &&
      /^[0-9a-f-]{36}$/.test(parsed[1])
    ) {
      return [parsed[0], parsed[1]];
    }
  } catch {
    // fall through
  }
  throw badCursor();
}

/** "YYYY-MM-DDTHH:MI" → { date, startTime }. */
function splitLocal(value: string | null): ClientListItem["nextSession"] {
  if (!value) return null;
  const [date = "", startTime = ""] = value.split("T");
  return { date, startTime };
}

/**
 * Clients (PROMPT §8.3): list with per-status counts, the client detail, lifecycle (active ↔ paused
 * ↔ archived) and private notes. Runs in the request transaction as fitcoach_app; every query also
 * filters by the workspace from the session (CLAUDE.md rules 1 and 3).
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly appointments: AppointmentsService,
    private readonly systemDb: SystemDb,
    private readonly packages: PackagesService,
    private readonly assignments: AssignmentsService,
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

  /**
   * Correlated subquery on the outer `clients` row. The outer columns are qualified by hand:
   * in a single-table select Drizzle renders `${clients.id}` unqualified, which would bind to `a.id`.
   */
  private nextSessionSql(timezone: string) {
    const outer = sql.identifier("clients");
    return sql<string | null>`(
      select to_char(min(a.starts_at) at time zone ${timezone}, 'YYYY-MM-DD"T"HH24:MI')
      from ${appointments} a
      where a.workspace_id = ${outer}.workspace_id and a.client_id = ${outer}.id
        and a.status in ('scheduled', 'confirmed') and a.starts_at >= now()
    )`;
  }

  private toListItem(row: ClientRow, nextSession: string | null): ClientListItem {
    return {
      id: row.id,
      fullName: row.fullName,
      status: row.status as ClientStatus,
      goal: row.goal as FitnessGoal | null,
      trainingMode: row.trainingMode as CoachingMode | null,
      phoneE164: row.phoneE164,
      nextSession: splitLocal(nextSession),
      createdAt: iso(row.createdAt),
    };
  }

  async list(query: ClientListQuery): Promise<ClientListResponse> {
    const trainer = this.trainer();
    const timezone = await this.timezone(trainer);
    const filters: SQL[] = [eq(clients.workspaceId, trainer.workspaceId)];
    if (query.goal) filters.push(eq(clients.goal, query.goal));
    if (query.mode) filters.push(eq(clients.trainingMode, query.mode));
    const term = query.q?.trim();
    if (term) {
      const digits = term.replace(/\D/g, "");
      const matches: SQL[] = [
        sql`${clients.fullName} ilike ${likePattern(term)}`,
        sql`${clients.email}::text ilike ${likePattern(term)}`,
      ];
      if (digits.length >= 3) matches.push(sql`${clients.phoneE164} like ${likePattern(digits)}`);
      const anyMatch = or(...matches);
      if (anyMatch) filters.push(anyMatch);
    }
    if (query.attention) {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
      if (query.attention === "payment_due") {
        filters.push(this.packages.paymentDueCondition(today));
      } else {
        const [settings] = await this.db.tx
          .select({
            low: trainerSettings.lowSessionsThreshold,
            days: trainerSettings.expiryWarningDays,
          })
          .from(trainerSettings)
          .where(eq(trainerSettings.workspaceId, trainer.workspaceId));
        filters.push(
          this.packages.lowSessionsCondition(today, settings?.low ?? 2, settings?.days ?? 7),
        );
      }
    }

    const byStatus = await this.db.tx
      .select({ status: clients.status, count: sql<number>`count(*)::int` })
      .from(clients)
      .where(and(...filters))
      .groupBy(clients.status);
    const counts = { onboarding_draft: 0, active: 0, paused: 0, archived: 0 };
    for (const row of byStatus) counts[row.status as ClientStatus] = row.count;

    const sort = SORTS[query.sort];
    const conditions = [...filters, eq(clients.status, query.status)];
    if (query.cursor) {
      const [value, id] = decodeCursor(query.cursor);
      conditions.push(
        sql`(${sort.key}, ${clients.id}) ${sql.raw(sort.direction === "desc" ? "<" : ">")} (${value}::${sql.raw(sort.cast)}, ${id}::uuid)`,
      );
    }
    const order = sort.direction === "desc" ? sql`desc` : sql`asc`;
    const rows = await this.db.tx
      .select({ client: clients, nextSession: this.nextSessionSql(timezone) })
      .from(clients)
      .where(and(...conditions))
      .orderBy(sql`${sort.key} ${order}`, sql`${clients.id} ${order}`)
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1)?.client;
    return {
      items: page.map(({ client, nextSession }) => this.toListItem(client, nextSession)),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor(sort.encode(last), last.id) : null,
      counts,
    };
  }

  private async findClient(trainer: Trainer, id: string): Promise<ClientRow> {
    const [row] = await this.db.tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.workspaceId, trainer.workspaceId)));
    if (!row) throw clientNotFound();
    return row;
  }

  async get(id: string): Promise<ClientDetail> {
    const trainer = this.trainer();
    const timezone = await this.timezone(trainer);
    const client = await this.findClient(trainer, id);
    const scope = (table: { workspaceId: AnyPgColumn; clientId: AnyPgColumn }) =>
      and(eq(table.workspaceId, trainer.workspaceId), eq(table.clientId, id));

    const [next] = await this.db.tx
      .select({ next: this.nextSessionSql(timezone) })
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.workspaceId, trainer.workspaceId)));
    const [nextAppointment] = await this.db.tx
      .select({
        id: appointments.id,
        kind: appointments.kind,
        date: sql<string>`to_char(${appointments.startsAt} at time zone ${timezone}, 'YYYY-MM-DD')`,
        startTime: sql<string>`to_char(${appointments.startsAt} at time zone ${timezone}, 'HH24:MI')`,
      })
      .from(appointments)
      .where(
        and(
          scope(appointments),
          inArray(appointments.status, ["scheduled", "confirmed"]),
          sql`${appointments.startsAt} >= now()`,
        ),
      )
      .orderBy(appointments.startsAt)
      .limit(1);
    const [completed] = await this.db.tx
      .select({ count: sql<number>`count(*)::int` })
      .from(appointments)
      .where(and(scope(appointments), eq(appointments.status, "completed")));
    // Whole weeks since coaching started (or onboarding), counted in workspace-local days.
    const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    const started =
      client.coachingStartOn ?? (client.onboardedAt ? localDay.format(client.onboardedAt) : null);
    const weeksWithYou = started
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(localDay.format(new Date())) - Date.parse(started)) / (7 * 86_400_000),
          ),
        )
      : null;

    const goals = await this.db.tx
      .select()
      .from(clientGoals)
      .where(and(scope(clientGoals), eq(clientGoals.status, "active")))
      .orderBy(clientGoals.kind, clientGoals.createdAt);
    const consents = await this.db.tx
      .selectDistinctOn([clientConsents.kind])
      .from(clientConsents)
      .where(scope(clientConsents))
      .orderBy(clientConsents.kind, desc(clientConsents.recordedAt), desc(clientConsents.id));
    const latest = await this.db.tx.execute<{
      key: string;
      name: string;
      unit_kind: "mass" | "length" | "percent" | "count";
      value: string;
      measured_on: string;
      points: number;
      sort_order: number;
    }>(sql`
      select distinct on (m.type_id) t.key, t.name, t.unit_kind, m.value::text as value,
        m.measured_on::text as measured_on, t.sort_order,
        count(*) over (partition by m.type_id)::int as points
      from ${measurements} m join ${measurementTypes} t on t.id = m.type_id
      where m.workspace_id = ${trainer.workspaceId} and m.client_id = ${id} and m.voided_at is null
      order by m.type_id, m.measured_on desc, m.created_at desc`);
    const [settings] = await this.db.tx
      .select({ weightUnit: trainerSettings.weightUnit, lengthUnit: trainerSettings.lengthUnit })
      .from(trainerSettings)
      .where(eq(trainerSettings.workspaceId, trainer.workspaceId));

    const events = await this.db.tx
      .select()
      .from(activityEvents)
      .where(scope(activityEvents))
      .orderBy(desc(activityEvents.createdAt))
      .limit(10);
    const attended = await this.db.tx
      .select({
        status: appointments.status,
        kind: appointments.kind,
        at: appointments.attendanceMarkedAt,
        date: sql<string>`to_char(${appointments.startsAt} at time zone ${timezone}, 'YYYY-MM-DD')`,
        startTime: sql<string>`to_char(${appointments.startsAt} at time zone ${timezone}, 'HH24:MI')`,
      })
      .from(appointments)
      .where(and(scope(appointments), inArray(appointments.status, ["completed", "no_show"])))
      .orderBy(desc(appointments.attendanceMarkedAt))
      .limit(10);
    const recentActivity: ClientDetail["recentActivity"] = [
      ...events.map((event) => ({
        type: event.type as ClientDetail["recentActivity"][number]["type"],
        at: iso(event.createdAt),
        data: (event.data ?? {}) as Record<string, unknown>,
      })),
      ...attended
        .filter((row) => row.at)
        .map((row) => ({
          type: (row.status === "completed" ? "session_attended" : "session_no_show") as
            "session_attended" | "session_no_show",
          at: iso(row.at as Date),
          data: { kind: row.kind, date: row.date, startTime: row.startTime },
        })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 10);

    const notes = await this.db.tx
      .select()
      .from(clientNotes)
      .where(scope(clientNotes))
      .orderBy(desc(clientNotes.createdAt), desc(clientNotes.id))
      .limit(100);

    let onboardingLink: string | null = null;
    if (client.status === "onboarding_draft") {
      const [draft] = await this.db.tx
        .select({ id: clientOnboardingDrafts.id })
        .from(clientOnboardingDrafts)
        .where(and(scope(clientOnboardingDrafts), isNull(clientOnboardingDrafts.finalizedAt)));
      onboardingLink = draft
        ? `/app/clients/new?draft=${draft.id}`
        : client.sourceLeadId
          ? `/app/clients/new?fromLead=${client.sourceLeadId}`
          : null;
    }

    const emergency = client.emergencyContact as {
      name?: string;
      phone?: string | null;
      relation?: string | null;
    } | null;
    const age = client.dob
      ? Math.floor((Date.now() - Date.parse(`${client.dob}T00:00:00Z`)) / (365.2425 * 86_400_000))
      : null;

    return {
      ...this.toListItem(client, next?.next ?? null),
      email: client.email,
      preferredContact: client.preferredContact as ClientDetail["preferredContact"],
      dob: client.dob,
      age,
      location: client.location,
      preferredSchedule: client.preferredSchedule,
      experienceLevel: client.experienceLevel as ClientDetail["experienceLevel"],
      equipment: client.equipment,
      limitations: client.limitations,
      emergencyContact: emergency?.name
        ? {
            name: emergency.name,
            phone: emergency.phone ?? null,
            relation: emergency.relation ?? null,
          }
        : null,
      coachingStartOn: client.coachingStartOn,
      onboardedAt: isoOrNull(client.onboardedAt),
      archivedAt: isoOrNull(client.archivedAt),
      sourceLeadId: client.sourceLeadId,
      onboardingLink,
      timezone: client.timezone ?? timezone,
      goals: goals.map((goal) => ({
        kind: goal.kind as "primary" | "secondary",
        goal: goal.goal as FitnessGoal,
        targetText: goal.targetText,
        targetDate: goal.targetDate,
      })),
      consents: consents.map((consent) => ({
        kind: consent.kind as ClientDetail["consents"][number]["kind"],
        status: consent.status as ClientDetail["consents"][number]["status"],
        noticeVersion: consent.noticeVersion,
        recordedAt: iso(consent.recordedAt),
      })),
      stats: {
        weeksWithYou: client.onboardedAt ? weeksWithYou : null,
        sessionsCompleted: completed?.count ?? 0,
        nextAppointment: nextAppointment
          ? {
              ...nextAppointment,
              kind: nextAppointment.kind as NonNullable<
                ClientDetail["stats"]["nextAppointment"]
              >["kind"],
            }
          : null,
      },
      measurements: latest.rows
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((row) => ({
          key: row.key,
          name: row.name,
          unitKind: row.unit_kind,
          value: Number(row.value),
          measuredOn: row.measured_on,
          points: row.points,
        })),
      units: {
        weightUnit: (settings?.weightUnit ?? "kg") as WeightUnit,
        lengthUnit: (settings?.lengthUnit ?? "cm") as LengthUnit,
      },
      package: await this.packages.card(id),
      recentActivity,
      notes: notes.map((note) => ({
        id: note.id,
        body: note.body,
        createdAt: iso(note.createdAt),
      })),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------------------------

  async addNote(id: string, body: string): Promise<ClientDetail> {
    const trainer = this.trainer();
    await this.findClient(trainer, id);
    await this.db.tx.insert(clientNotes).values({
      workspaceId: trainer.workspaceId,
      clientId: id,
      body,
      authorUserId: trainer.userId,
    });
    return this.get(id);
  }

  /**
   * Lifecycle (§8.3). Archiving cancels future sessions, ends series and revokes the client's portal
   * sessions; restoring returns an onboarded client to active (within the plan limit) and one who
   * never finished onboarding to onboarding. History is never removed.
   */
  async changeStatus(id: string, input: ClientStatusRequest): Promise<ClientDetail> {
    const trainer = this.trainer();
    const [client] = await this.db.tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.workspaceId, trainer.workspaceId)))
      .for("update");
    if (!client) throw clientNotFound();
    const status = client.status as ClientStatus;
    const refuse = (message: string) => new DomainError(ERROR_CODES.CONFLICT_STATE, 409, message);

    let next: ClientStatus;
    switch (input.action) {
      case "pause":
        if (status !== "active") throw refuse(`Only an active client can be paused.`);
        next = "paused";
        break;
      case "resume":
        if (status !== "paused") throw refuse(`Only a paused client can be resumed.`);
        next = "active";
        break;
      case "archive":
        if (status === "archived") throw refuse(`${client.fullName} is already archived.`);
        next = "archived";
        break;
      case "restore":
        if (status !== "archived") throw refuse(`Only an archived client can be restored.`);
        next = client.onboardedAt ? "active" : "onboarding_draft";
        break;
    }

    if (input.action === "restore") {
      // Phone and email are unique among non-archived clients; say who has them now.
      const sameContact: SQL[] = [];
      if (client.phoneE164) sameContact.push(eq(clients.phoneE164, client.phoneE164));
      if (client.email) sameContact.push(sql`${clients.email} = ${client.email}`);
      const anyContact = or(...sameContact);
      if (anyContact) {
        const [match] = await this.db.tx
          .select({ fullName: clients.fullName })
          .from(clients)
          .where(
            and(
              eq(clients.workspaceId, trainer.workspaceId),
              ne(clients.status, "archived"),
              ne(clients.id, id),
              anyContact,
            ),
          )
          .limit(1);
        if (match) {
          throw new DomainError(
            ERROR_CODES.CONFLICT_DUPLICATE,
            409,
            `${match.fullName} already uses this phone number or email, so ${client.fullName} can't be restored.`,
          );
        }
      }
    }

    // A move to active goes through the plan-limit trigger (FC001 → PLAN_LIMIT).
    await this.db.tx
      .update(clients)
      .set({ status: next, archivedAt: next === "archived" ? sql`now()` : null })
      .where(and(eq(clients.id, id), eq(clients.workspaceId, trainer.workspaceId)));

    let cancelled = 0;
    if (next === "archived") {
      cancelled = await this.appointments.cancelFutureForClient(id, "Client archived");
      await this.assignments.endForClient(id);
      if (client.userId) {
        const userId = client.userId;
        // Portal sessions belong to the client's own user, which RLS doesn't let a trainer touch.
        await this.systemDb.run("clients: revoke an archived client's portal sessions", (tx) =>
          tx
            .update(sessions)
            .set({ revokedAt: sql`now()`, revokedReason: "archived" })
            .where(
              and(
                eq(sessions.userId, userId),
                eq(sessions.actor, "client"),
                eq(sessions.workspaceId, trainer.workspaceId),
                isNull(sessions.revokedAt),
              ),
            ),
        );
      }
    }

    await this.db.tx.insert(activityEvents).values({
      workspaceId: trainer.workspaceId,
      type: {
        pause: "client_paused",
        resume: "client_resumed",
        archive: "client_archived",
        restore: "client_restored",
      }[input.action],
      clientId: id,
      data: {
        from: status,
        to: next,
        ...(input.reason ? { reason: input.reason } : {}),
        ...(next === "archived" ? { cancelledSessions: cancelled } : {}),
      },
      actorUserId: trainer.userId,
    });
    return this.get(id);
  }
}
