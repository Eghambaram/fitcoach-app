import { Injectable } from "@nestjs/common";
import {
  type ChangeLeadStageRequest,
  type ClientStatus,
  type CoachingMode,
  type CreateLeadRequest,
  type DuplicateCheckRequest,
  type DuplicateCheckResponse,
  ERROR_CODES,
  FITNESS_GOAL_LABELS,
  type FitnessGoal,
  type FollowUpState,
  LEAD_EXPORT_MAX,
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  type LeadActivity,
  type LeadDetailResponse,
  type LeadFilters,
  type LeadFollowUp,
  type LeadListItem,
  type LeadListQuery,
  type LeadListResponse,
  type LeadSort,
  type LeadSource,
  type LeadsSummaryResponse,
  type LeadStage,
  LOST_REASON_LABELS,
  type LostReason,
  type MessageTemplatePurpose,
  normalizePhone,
  OPEN_LEAD_STAGES,
  type UpdateLeadRequest,
  type WhatsAppLink,
} from "@fitcoach/shared";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import {
  clients,
  communicationLogs,
  leadActivities,
  leadConsents,
  leadFollowUps,
  leadForms,
  leads,
  workspaces,
} from "../../db/schema";
import {
  type MessageContext,
  WhatsAppLinkBuilder,
} from "../../integrations/whatsapp/whatsapp-link-builder";
import { recordAudit } from "../audit/audit.service";

export type Trainer = AuthContext & { workspaceId: string };
export type LeadRow = typeof leads.$inferSelect;

export const leadNotFound = () => DomainError.notFound("That lead doesn't exist.");
/** A converted lead is final (its client carries on); RLS would silently match no rows. */
function assertNotConverted(lead: { stage: string }): void {
  if (lead.stage === "converted") {
    throw new DomainError(
      ERROR_CODES.CONFLICT_STATE,
      409,
      "This lead is already a client, so it can't change.",
    );
  }
}

const badCursor = () =>
  new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "This list is out of date. Reload it.", {
    cursor: ["Invalid cursor"],
  });

/** Activities that don't count as "something happened" when deciding whether a lead may be deleted. */
const ORIGIN_ACTIVITIES = ["created", "enquiry_received"];
/** The editable detail fields, for "details_updated" entries (names only, never values). */
const DETAIL_FIELDS = [
  "fullName",
  "phoneE164",
  "email",
  "goal",
  "source",
  "trainingMode",
  "preferredSchedule",
  "location",
  "interestedService",
  "referrer",
  "campaign",
] as const;

/** Lets Excel open UTF-8 (₹, Hindi, accents) correctly. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const iso = (value: Date) => value.toISOString();
const isoOrNull = (value: Date | null) => (value ? value.toISOString() : null);

/** `%` and `_` are wildcards in LIKE; a search for "50%" must find "50%". */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** A timestamp's calendar day in the workspace time zone (CLAUDE.md rule 19). */
export const localDay = (column: SQL | typeof leads.nextFollowUpAt, timezone: string) =>
  sql`(${column} at time zone ${timezone})::date`;
export const today = (timezone: string) => sql`(now() at time zone ${timezone})::date`;

/** Overdue (an earlier day), today, or upcoming; null when there's nothing due. */
export function followUpStateSql(column: SQL | typeof leads.nextFollowUpAt, timezone: string) {
  return sql<FollowUpState | null>`case
    when ${column} is null then null
    when ${localDay(column, timezone)} < ${today(timezone)} then 'overdue'
    when ${localDay(column, timezone)} = ${today(timezone)} then 'today'
    else 'upcoming' end`;
}

function toListItem(
  row: LeadRow,
  followUpState: FollowUpState | null,
  whatsApp: WhatsAppLink | null,
): LeadListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    phoneE164: row.phoneE164,
    email: row.email,
    goal: row.goal as FitnessGoal,
    trainingMode: row.trainingMode as CoachingMode | null,
    source: row.source as LeadSource,
    stage: row.stage as LeadStage,
    lastContactAt: isoOrNull(row.lastContactAt),
    nextFollowUpAt: isoOrNull(row.nextFollowUpAt),
    followUpState: row.nextFollowUpAt ? followUpState : null,
    createdAt: iso(row.createdAt),
    archived: row.archivedAt !== null,
    whatsApp,
  };
}

/** Keyset pagination: each sort has an order and a matching "after this row" condition. */
const SORTS: Record<
  LeadSort,
  { key: SQL; direction: "asc" | "desc"; encode: (row: LeadRow) => string; cast: string }
> = {
  next_follow_up: {
    key: sql`coalesce(${leads.nextFollowUpAt}, 'infinity'::timestamptz)`,
    direction: "asc",
    encode: (row) => (row.nextFollowUpAt ? iso(row.nextFollowUpAt) : "infinity"),
    cast: "timestamptz",
  },
  newest: {
    key: sql`${leads.createdAt}`,
    direction: "desc",
    encode: (row) => iso(row.createdAt),
    cast: "timestamptz",
  },
  oldest: {
    key: sql`${leads.createdAt}`,
    direction: "asc",
    encode: (row) => iso(row.createdAt),
    cast: "timestamptz",
  },
  name: {
    key: sql`lower(${leads.fullName})`,
    direction: "asc",
    encode: (row) => row.fullName.toLowerCase(),
    cast: "text",
  },
  last_contact: {
    key: sql`coalesce(${leads.lastContactAt}, '-infinity'::timestamptz)`,
    direction: "desc",
    encode: (row) => (row.lastContactAt ? iso(row.lastContactAt) : "-infinity"),
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

/** CSV cell: quoted, and text that a spreadsheet would run as a formula is neutralised. */
function csvCell(value: string | null, { freeText = true } = {}): string {
  let text = value ?? "";
  if (freeText && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Lead CRM (PROMPT §8.2). Runs in the request transaction as fitcoach_app: RLS limits everything to
 * the caller's workspace, and every query also filters by it (CLAUDE.md rule 3). Stage changes,
 * edits and notes write `lead_activities` in the same transaction.
 */
@Injectable()
export class LeadsService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly whatsApp: WhatsAppLinkBuilder,
  ) {}

  trainer(): Trainer {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { ...auth, workspaceId: auth.workspaceId };
  }

  async workspace(trainer: Trainer): Promise<{ country: string; timezone: string }> {
    const [row] = await this.db.tx
      .select({ country: workspaces.country, timezone: workspaces.timezone })
      .from(workspaces)
      .where(eq(workspaces.id, trainer.workspaceId));
    if (!row) throw DomainError.forbidden();
    return row;
  }

  messageContext(trainer: Trainer, purpose: MessageTemplatePurpose): Promise<MessageContext> {
    return this.whatsApp.context(trainer.workspaceId, trainer.userId, purpose);
  }

  /** Conditions for search, source, mode, follow-up range and archived (everything but stage). */
  private filterConditions(trainer: Trainer, filters: LeadFilters, timezone: string): SQL[] {
    const conditions: SQL[] = [eq(leads.workspaceId, trainer.workspaceId)];
    conditions.push(filters.archived ? isNotNull(leads.archivedAt) : isNull(leads.archivedAt));
    if (filters.source) conditions.push(eq(leads.source, filters.source));
    if (filters.mode) conditions.push(eq(leads.trainingMode, filters.mode));
    if (filters.followUp) {
      const due = localDay(leads.nextFollowUpAt, timezone);
      const now = today(timezone);
      conditions.push(
        {
          due: sql`${due} <= ${now}`,
          overdue: sql`${due} < ${now}`,
          today: sql`${due} = ${now}`,
          next_7_days: sql`${due} >= ${now} and ${due} < ${now} + 7`,
          none: sql`${leads.nextFollowUpAt} is null`,
        }[filters.followUp],
      );
    }
    const term = filters.q?.trim();
    if (term) {
      const pattern = likePattern(term);
      const lower = term.toLowerCase();
      const digits = term.replace(/\D/g, "");
      const goals = Object.entries(FITNESS_GOAL_LABELS)
        .filter(([, label]) => label.toLowerCase().includes(lower))
        .map(([goal]) => goal);
      const sources = Object.entries(LEAD_SOURCE_LABELS)
        .filter(([, label]) => label.toLowerCase().includes(lower))
        .map(([source]) => source);
      const matches: SQL[] = [
        sql`${leads.fullName} ilike ${pattern}`,
        sql`${leads.email}::text ilike ${pattern}`,
      ];
      if (digits.length >= 3) matches.push(sql`${leads.phoneE164} like ${likePattern(digits)}`);
      if (goals.length > 0) matches.push(inArray(leads.goal, goals));
      if (sources.length > 0) matches.push(inArray(leads.source, sources));
      const anyMatch = or(...matches);
      if (anyMatch) conditions.push(anyMatch);
    }
    return conditions;
  }

  // -------------------------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------------------------

  async list(query: LeadListQuery): Promise<LeadListResponse> {
    const trainer = this.trainer();
    const { timezone } = await this.workspace(trainer);
    const sort = SORTS[query.sort];
    const conditions = this.filterConditions(trainer, query, timezone);
    if (query.stage) conditions.push(eq(leads.stage, query.stage));
    if (query.cursor) {
      const [value, id] = decodeCursor(query.cursor);
      const after = sql`(${sort.key}, ${leads.id}) ${sql.raw(sort.direction === "desc" ? "<" : ">")} (${value}::${sql.raw(sort.cast)}, ${id}::uuid)`;
      conditions.push(after);
    }

    const order = sort.direction === "desc" ? sql`desc` : sql`asc`;
    const rows = await this.db.tx
      .select({ lead: leads, followUpState: followUpStateSql(leads.nextFollowUpAt, timezone) })
      .from(leads)
      .where(and(...conditions))
      .orderBy(sql`${sort.key} ${order}`, sql`${leads.id} ${order}`)
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1)?.lead;
    const message = await this.messageContext(trainer, "follow_up");
    return {
      items: page.map(({ lead, followUpState }) =>
        toListItem(lead, followUpState, this.whatsApp.build(message, lead)),
      ),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor(sort.encode(last), last.id) : null,
    };
  }

  async summary(filters: LeadFilters): Promise<LeadsSummaryResponse> {
    const trainer = this.trainer();
    const { timezone } = await this.workspace(trainer);

    const byStage = await this.db.tx
      .select({ stage: leads.stage, count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(...this.filterConditions(trainer, filters, timezone)))
      .groupBy(leads.stage);
    const stageCounts = Object.fromEntries(LEAD_STAGES.map((stage) => [stage, 0])) as Record<
      LeadStage,
      number
    >;
    for (const row of byStage) stageCounts[row.stage as LeadStage] = row.count;

    // "This week" starts on Monday in the workspace's time zone (CLAUDE.md rule 19).
    const [kpis] = await this.db.tx
      .select({
        open: sql<number>`count(*) filter (where ${leads.archivedAt} is null and ${inArray(leads.stage, [...OPEN_LEAD_STAGES])})::int`,
        newThisWeek: sql<number>`count(*) filter (where ${leads.createdAt} >= date_trunc('week', now() at time zone ${timezone}) at time zone ${timezone})::int`,
        fromPublicPage30Days: sql<number>`count(*) filter (where ${leads.createdVia} = 'public_page' and ${leads.createdAt} >= now() - interval '30 days')::int`,
      })
      .from(leads)
      .where(eq(leads.workspaceId, trainer.workspaceId));
    const due = localDay(sql`${leadFollowUps.dueAt}`, timezone);
    const [followUps] = await this.db.tx
      .select({
        due: sql<number>`count(*) filter (where ${due} <= ${today(timezone)})::int`,
        overdue: sql<number>`count(*) filter (where ${due} < ${today(timezone)})::int`,
      })
      .from(leadFollowUps)
      .innerJoin(
        leads,
        and(eq(leads.workspaceId, leadFollowUps.workspaceId), eq(leads.id, leadFollowUps.leadId)),
      )
      .where(
        and(
          eq(leadFollowUps.workspaceId, trainer.workspaceId),
          eq(leadFollowUps.status, "open"),
          isNull(leads.archivedAt),
          ne(leads.stage, "converted"),
        ),
      );

    return {
      stageCounts: {
        all: Object.values(stageCounts).reduce((sum, count) => sum + count, 0),
        ...stageCounts,
      },
      kpis: {
        ...(kpis ?? { open: 0, newThisWeek: 0, fromPublicPage30Days: 0 }),
        followUpsDue: followUps?.due ?? 0,
        followUpsOverdue: followUps?.overdue ?? 0,
      },
    };
  }

  async exportCsv(filters: LeadFilters & { stage?: LeadStage }): Promise<string> {
    const trainer = this.trainer();
    const { timezone } = await this.workspace(trainer);
    const conditions = this.filterConditions(trainer, filters, timezone);
    if (filters.stage) conditions.push(eq(leads.stage, filters.stage));
    const rows = await this.db.tx
      .select()
      .from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt), desc(leads.id))
      .limit(LEAD_EXPORT_MAX);

    const when = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const header = [
      "Name",
      "Phone",
      "Email",
      "Goal",
      "Training mode",
      "Source",
      "Stage",
      "Lost reason",
      "Preferred schedule",
      "Location",
      "Interested in",
      "Referrer",
      "Campaign",
      "Created",
      "Last contact",
      "Next follow-up",
    ];
    const lines = rows.map((row) =>
      [
        csvCell(row.fullName),
        csvCell(row.phoneE164, { freeText: false }),
        csvCell(row.email),
        csvCell(FITNESS_GOAL_LABELS[row.goal as FitnessGoal], { freeText: false }),
        csvCell(row.trainingMode, { freeText: false }),
        csvCell(LEAD_SOURCE_LABELS[row.source as LeadSource], { freeText: false }),
        csvCell(LEAD_STAGE_LABELS[row.stage as LeadStage], { freeText: false }),
        csvCell(row.lostReason ? LOST_REASON_LABELS[row.lostReason as LostReason] : null, {
          freeText: false,
        }),
        csvCell(row.preferredSchedule),
        csvCell(row.location),
        csvCell(row.interestedService),
        csvCell(row.referrer),
        csvCell(row.campaign),
        csvCell(when.format(row.createdAt).replace(",", ""), { freeText: false }),
        csvCell(row.lastContactAt ? when.format(row.lastContactAt).replace(",", "") : null, {
          freeText: false,
        }),
        csvCell(row.nextFollowUpAt ? when.format(row.nextFollowUpAt).replace(",", "") : null, {
          freeText: false,
        }),
      ].join(","),
    );
    return `${BYTE_ORDER_MARK}${[header.map((name) => csvCell(name, { freeText: false })).join(","), ...lines].join("\r\n")}\r\n`;
  }

  async findLead(trainer: Trainer, id: string): Promise<LeadRow> {
    const [row] = await this.db.tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.workspaceId, trainer.workspaceId)));
    if (!row) throw leadNotFound();
    return row;
  }

  async get(id: string): Promise<LeadDetailResponse> {
    const trainer = this.trainer();
    const lead = await this.findLead(trainer, id);
    const history = await this.db.tx
      .select({
        id: leadActivities.id,
        type: leadActivities.type,
        data: leadActivities.data,
        actorKind: leadActivities.actorKind,
        createdAt: leadActivities.createdAt,
      })
      .from(leadActivities)
      .where(
        and(eq(leadActivities.workspaceId, trainer.workspaceId), eq(leadActivities.leadId, id)),
      )
      .orderBy(desc(leadActivities.createdAt), desc(leadActivities.id))
      .limit(300);
    const [consent] = await this.db.tx
      .select({
        version: leadForms.version,
        text: leadForms.consentText,
        consentedAt: leadConsents.consentedAt,
      })
      .from(leadConsents)
      .innerJoin(
        leadForms,
        and(
          eq(leadForms.id, leadConsents.leadFormId),
          eq(leadForms.workspaceId, leadConsents.workspaceId),
        ),
      )
      .where(and(eq(leadConsents.workspaceId, trainer.workspaceId), eq(leadConsents.leadId, id)))
      .orderBy(desc(leadConsents.consentedAt))
      .limit(1);

    const contacts = await this.db.tx
      .select()
      .from(communicationLogs)
      .where(
        and(
          eq(communicationLogs.workspaceId, trainer.workspaceId),
          eq(communicationLogs.leadId, id),
        ),
      )
      .orderBy(desc(communicationLogs.occurredAt), desc(communicationLogs.id))
      .limit(300);
    const followUps = await this.followUps(trainer, id);
    const message = await this.messageContext(trainer, "follow_up");

    const activities: LeadActivity[] = contacts.map((contact) => ({
      id: contact.id,
      type: "contact_logged",
      data: {
        channel: contact.channel,
        outcome: contact.outcome,
        note: contact.note,
        templatePurpose: contact.templatePurpose,
        followUpId: contact.followUpId,
      },
      actorKind: "trainer",
      createdAt: iso(contact.occurredAt),
    }));
    const notes: LeadDetailResponse["notes"] = [];
    for (const entry of history) {
      const data = (entry.data ?? {}) as Record<string, unknown>;
      if (entry.type === "note") {
        notes.push({
          id: entry.id,
          body: String(data.body ?? ""),
          createdAt: iso(entry.createdAt),
        });
      } else {
        activities.push({
          id: entry.id,
          type: entry.type as LeadActivity["type"],
          data,
          actorKind: entry.actorKind as LeadActivity["actorKind"],
          createdAt: iso(entry.createdAt),
        });
      }
    }

    // Stable sort: entries written in one transaction share a time and keep their merge order.
    activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const nextOpen = followUps.find((followUp) => followUp.status === "open");

    return {
      ...toListItem(lead, nextOpen?.state ?? null, this.whatsApp.build(message, lead)),
      preferredSchedule: lead.preferredSchedule,
      message: lead.message,
      location: lead.location,
      interestedService: lead.interestedService,
      referrer: lead.referrer,
      campaign: lead.campaign,
      utm: (lead.utm ?? {}) as Record<string, string>,
      createdVia: lead.createdVia as LeadDetailResponse["createdVia"],
      lostReason: lead.lostReason as LostReason | null,
      nurtureUntil: lead.nurtureUntil,
      consent: consent
        ? { version: consent.version, text: consent.text, consentedAt: iso(consent.consentedAt) }
        : null,
      activities,
      notes,
      followUps,
      convertedClientId: lead.convertedClientId,
      convertedAt: isoOrNull(lead.convertedAt),
      canDelete:
        contacts.length === 0 && history.every((entry) => ORIGIN_ACTIVITIES.includes(entry.type)),
    };
  }

  /** Open follow-ups soonest first, then the 20 most recently finished. */
  private async followUps(trainer: Trainer, leadId: string): Promise<LeadFollowUp[]> {
    const { timezone } = await this.workspace(trainer);
    const local = sql`${leadFollowUps.dueAt} at time zone ${timezone}`;
    const columns = {
      row: leadFollowUps,
      dueDate: sql<string>`to_char(${local}, 'YYYY-MM-DD')`,
      dueTime: sql<string>`to_char(${local}, 'HH24:MI')`,
      state: followUpStateSql(sql`${leadFollowUps.dueAt}`, timezone),
    };
    const scope = and(
      eq(leadFollowUps.workspaceId, trainer.workspaceId),
      eq(leadFollowUps.leadId, leadId),
    );
    const open = await this.db.tx
      .select(columns)
      .from(leadFollowUps)
      .where(and(scope, eq(leadFollowUps.status, "open")))
      .orderBy(asc(leadFollowUps.dueAt), asc(leadFollowUps.id));
    const finished = await this.db.tx
      .select(columns)
      .from(leadFollowUps)
      .where(and(scope, ne(leadFollowUps.status, "open")))
      .orderBy(desc(leadFollowUps.completedAt), desc(leadFollowUps.id))
      .limit(20);

    return [...open, ...finished].map(({ row, dueDate, dueTime, state }) => ({
      id: row.id,
      actionType: row.actionType as LeadFollowUp["actionType"],
      dueAt: iso(row.dueAt),
      dueDate,
      dueTime,
      status: row.status as LeadFollowUp["status"],
      state: row.status === "open" ? state : null,
      notes: row.notes,
      reminder: row.reminder as LeadFollowUp["reminder"],
      outcome: row.outcome as LeadFollowUp["outcome"],
      outcomeNote: row.outcomeNote,
      completedAt: isoOrNull(row.completedAt),
      createdAt: iso(row.createdAt),
    }));
  }

  /** Possible matches on normalised phone or email across leads and non-archived clients (§8.2). */
  async duplicates(input: DuplicateCheckRequest): Promise<DuplicateCheckResponse> {
    const trainer = this.trainer();
    const { country } = await this.workspace(trainer);
    const phone = input.phone ? normalizePhone(input.phone, country) : null;
    const email = input.email?.trim().toLowerCase() || null;
    if (!phone && !email) return { matches: [] };

    const matchers: SQL[] = [];
    if (phone) matchers.push(eq(leads.phoneE164, phone));
    if (email) matchers.push(sql`${leads.email} = ${email}`);
    const conditions: SQL[] = [eq(leads.workspaceId, trainer.workspaceId)];
    const anyMatch = or(...matchers);
    if (anyMatch) conditions.push(anyMatch);
    if (input.excludeLeadId) conditions.push(ne(leads.id, input.excludeLeadId));

    const rows = await this.db.tx
      .select({
        id: leads.id,
        fullName: leads.fullName,
        stage: leads.stage,
        phoneE164: leads.phoneE164,
        email: leads.email,
      })
      .from(leads)
      .where(and(...conditions))
      .orderBy(desc(leads.createdAt))
      .limit(5);

    const clientMatchers: SQL[] = [];
    if (phone) clientMatchers.push(eq(clients.phoneE164, phone));
    if (email) clientMatchers.push(sql`${clients.email} = ${email}`);
    const clientRows = await this.db.tx
      .select({
        id: clients.id,
        fullName: clients.fullName,
        status: clients.status,
        phoneE164: clients.phoneE164,
        email: clients.email,
      })
      .from(clients)
      .where(
        and(
          eq(clients.workspaceId, trainer.workspaceId),
          ne(clients.status, "archived"),
          or(...clientMatchers),
        ),
      )
      .orderBy(desc(clients.createdAt))
      .limit(5);

    const matchedOn = (row: { phoneE164: string | null; email: string | null }) => [
      ...(phone && row.phoneE164 === phone ? (["phone"] as const) : []),
      ...(email && row.email?.toLowerCase() === email ? (["email"] as const) : []),
    ];
    return {
      matches: [
        ...clientRows.map((row) => ({
          kind: "client" as const,
          id: row.id,
          fullName: row.fullName,
          status: row.status as ClientStatus,
          matchedOn: matchedOn(row),
        })),
        ...rows.map((row) => ({
          kind: "lead" as const,
          id: row.id,
          fullName: row.fullName,
          stage: row.stage as LeadStage,
          matchedOn: matchedOn(row),
        })),
      ],
    };
  }

  // -------------------------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------------------------

  private async details(trainer: Trainer, input: UpdateLeadRequest) {
    const { country } = await this.workspace(trainer);
    const phoneE164 = input.phone ? normalizePhone(input.phone, country) : null;
    if (input.phone && !phoneE164) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", {
        phone: ["Enter a valid phone number"],
      });
    }
    return {
      fullName: input.fullName,
      phoneE164,
      email: input.email || null,
      goal: input.goal,
      source: input.source,
      trainingMode: input.trainingMode ?? null,
      preferredSchedule: input.preferredSchedule || null,
      location: input.location || null,
      interestedService: input.interestedService || null,
      referrer: input.referrer || null,
      campaign: input.campaign || null,
    };
  }

  async log(
    trainer: Trainer,
    leadId: string,
    type: LeadActivity["type"],
    data: Record<string, unknown> = {},
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

  async create(input: CreateLeadRequest): Promise<LeadDetailResponse> {
    const trainer = this.trainer();
    const values = await this.details(trainer, input);
    const [lead] = await this.db.tx
      .insert(leads)
      .values({
        workspaceId: trainer.workspaceId,
        ...values,
        createdVia: "manual",
        createdByUserId: trainer.userId,
      })
      .returning({ id: leads.id });
    if (!lead) throw new Error("lead insert returned no row");
    await this.log(trainer, lead.id, "created", { source: values.source });
    if (input.note) await this.log(trainer, lead.id, "note", { body: input.note });
    return this.get(lead.id);
  }

  async update(id: string, input: UpdateLeadRequest): Promise<LeadDetailResponse> {
    const trainer = this.trainer();
    const before = await this.findLead(trainer, id);
    assertNotConverted(before);
    const values = await this.details(trainer, input);
    const changed = DETAIL_FIELDS.filter(
      (field) => (before[field] ?? null) !== (values[field] ?? null),
    );
    if (changed.length === 0) return this.get(id);

    await this.db.tx
      .update(leads)
      .set(values)
      .where(and(eq(leads.id, id), eq(leads.workspaceId, trainer.workspaceId)));
    await this.log(trainer, id, "details_updated", { fields: changed });
    return this.get(id);
  }

  async changeStage(id: string, input: ChangeLeadStageRequest): Promise<LeadDetailResponse> {
    const trainer = this.trainer();
    const lead = await this.findLead(trainer, id);
    if (lead.stage === "converted") {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "This lead is already a client, so its stage can't change.",
      );
    }
    const lost = input.stage === "lost";
    const sameStage = lead.stage === input.stage;
    const sameLostDetails =
      !lost ||
      (lead.lostReason === (input.lostReason ?? null) &&
        lead.nurtureUntil === (input.nurtureUntil ?? null));
    if (sameStage && sameLostDetails) return this.get(id);

    await this.db.tx
      .update(leads)
      .set({
        stage: input.stage,
        lostReason: lost ? (input.lostReason ?? null) : null,
        nurtureUntil: lost ? (input.nurtureUntil ?? null) : null,
      })
      .where(and(eq(leads.id, id), eq(leads.workspaceId, trainer.workspaceId)));
    await this.log(trainer, id, "stage_changed", {
      from: lead.stage,
      to: input.stage,
      ...(lost ? { lostReason: input.lostReason, nurtureUntil: input.nurtureUntil ?? null } : {}),
    });
    return this.get(id);
  }

  async addNote(id: string, body: string): Promise<LeadDetailResponse> {
    const trainer = this.trainer();
    await this.findLead(trainer, id);
    await this.log(trainer, id, "note", { body });
    return this.get(id);
  }

  async setArchived(id: string, archived: boolean): Promise<LeadDetailResponse> {
    const trainer = this.trainer();
    const lead = await this.findLead(trainer, id);
    assertNotConverted(lead);
    if ((lead.archivedAt !== null) === archived) return this.get(id);
    await this.db.tx
      .update(leads)
      .set({ archivedAt: archived ? new Date() : null })
      .where(and(eq(leads.id, id), eq(leads.workspaceId, trainer.workspaceId)));
    await this.log(trainer, id, archived ? "archived" : "restored");
    return this.get(id);
  }

  /** Only leads nothing has happened to yet; anything with history is archived instead (§8.2). */
  async remove(id: string): Promise<void> {
    const trainer = this.trainer();
    await this.findLead(trainer, id);
    const [touched] = await this.db.tx
      .select({ id: leadActivities.id })
      .from(leadActivities)
      .where(
        and(
          eq(leadActivities.workspaceId, trainer.workspaceId),
          eq(leadActivities.leadId, id),
          notInArray(leadActivities.type, ORIGIN_ACTIVITIES),
        ),
      )
      .limit(1);
    const [contacted] = await this.db.tx
      .select({ id: communicationLogs.id })
      .from(communicationLogs)
      .where(
        and(
          eq(communicationLogs.workspaceId, trainer.workspaceId),
          eq(communicationLogs.leadId, id),
        ),
      )
      .limit(1);
    if (touched || contacted) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "This lead has history, so it can't be deleted. Archive it instead.",
      );
    }
    await this.db.tx
      .delete(leads)
      .where(and(eq(leads.id, id), eq(leads.workspaceId, trainer.workspaceId)));
    await recordAudit(this.db.tx, {
      actorKind: "trainer",
      actorUserId: trainer.userId,
      workspaceId: trainer.workspaceId,
      action: "lead.deleted",
      targetType: "lead",
      targetId: id,
    });
  }
}
