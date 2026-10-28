import { Injectable } from "@nestjs/common";
import {
  ATTENTION_GROUP_LIMIT,
  ATTENDANCE_LOOKBACK_DAYS,
  type AttentionItem,
  type AttentionKind,
  type ClientActivityType,
  type DashboardAppointment,
  type DashboardQuery,
  type DashboardSummary,
  FEELING_LABELS,
  type Feeling,
  FOLLOW_UP_ACTION_LABELS,
  type FollowUpAction,
  formatInr,
  TRIAL_SOON_HOURS,
} from "@fitcoach/shared";
import { eq, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import { trainerSettings, workspaces } from "../../db/schema";
import {
  type MessageContext,
  WhatsAppLinkBuilder,
} from "../../integrations/whatsapp/whatsapp-link-builder";

type Trainer = { userId: string; workspaceId: string };
type Group = { kind: AttentionKind; count: number; items: AttentionItem[]; href: string };

/** "Mon, 3 Nov" for a YYYY-MM-DD in the workspace calendar. */
function day(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
/** "07:30" → "7:30 am". */
function time(hhmm: string): string {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`;
}

/**
 * The trainer dashboard (PROMPT §8.1): KPIs, the day's schedule, "Needs attention" in the specified
 * order, recent activity and the first-run checklist. A fixed set of queries per request (no N+1),
 * every date boundary in the workspace time zone; definitions are in packages/shared/metrics.ts and
 * docs/metrics.md. Runs as fitcoach_app under RLS and filters by the session's workspace.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly whatsApp: WhatsAppLinkBuilder,
  ) {}

  private trainer(): Trainer {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { userId: auth.userId, workspaceId: auth.workspaceId };
  }

  private async context(trainer: Trainer) {
    const [row] = await this.db.tx
      .select({
        timezone: workspaces.timezone,
        today: sql<string>`(now() at time zone ${workspaces.timezone})::date::text`,
        low: trainerSettings.lowSessionsThreshold,
        warningDays: trainerSettings.expiryWarningDays,
        noCheckInDays: trainerSettings.noCheckInDays,
        noMeasurementDays: trainerSettings.noMeasurementDays,
        dismissedAt: trainerSettings.firstRunDismissedAt,
      })
      .from(workspaces)
      .innerJoin(trainerSettings, eq(trainerSettings.workspaceId, workspaces.id))
      .where(eq(workspaces.id, trainer.workspaceId));
    if (!row) throw DomainError.forbidden();
    return row;
  }

  async summary(query: DashboardQuery): Promise<DashboardSummary> {
    const trainer = this.trainer();
    const ctx = await this.context(trainer);
    const date = query.date ?? ctx.today;
    return {
      today: ctx.today,
      date,
      timezone: ctx.timezone,
      kpis: await this.kpis(trainer, ctx),
      schedule: await this.schedule(trainer, ctx.timezone, date),
      attention: await this.attention(trainer, ctx),
      activity: await this.activity(trainer),
      checklist: await this.checklist(trainer, ctx.dismissedAt !== null),
    };
  }

  /** Closes the first-run checklist for good. */
  async dismissChecklist(): Promise<void> {
    const trainer = this.trainer();
    await this.db.tx
      .update(trainerSettings)
      .set({ firstRunDismissedAt: sql`coalesce(${trainerSettings.firstRunDismissedAt}, now())` })
      .where(eq(trainerSettings.workspaceId, trainer.workspaceId));
  }

  // -------------------------------------------------------------------------------------------
  // KPIs: one query (§8.1.1)
  // -------------------------------------------------------------------------------------------

  /** SQL for "an active package that still has a balance due by today". */
  private paymentDue(today: string) {
    return sql`p.status = 'active' and p.payment_due_on is not null and p.payment_due_on <= ${today}::date
      and p.amount_due_paise > coalesce((
        select sum(c.amount_paise) from client_payments c
        where c.workspace_id = p.workspace_id and c.package_id = p.id and c.voids_id is null
          and not exists (select 1 from client_payments v where v.voids_id = c.id)
      ), 0)`;
  }

  /** Sessions left of a package (session packs only), from the ledger. */
  private sessionsLeft() {
    return sql`case when p.kind = 'session_pack' and p.sessions_included is not null then
      p.sessions_included - coalesce((select sum(l.sessions_used) from package_session_ledger l
        where l.workspace_id = p.workspace_id and l.package_id = p.id), 0) end`;
  }

  private packageLow(today: string, low: number, warningDays: number) {
    return sql`p.status = 'active' and (
      (${this.sessionsLeft()}) <= ${low}
      or (p.expires_on is not null and p.expires_on <= ${today}::date + ${warningDays}::int))`;
  }

  private async kpis(
    trainer: Trainer,
    ctx: { timezone: string; today: string; low: number; warningDays: number },
  ): Promise<DashboardSummary["kpis"]> {
    const ws = trainer.workspaceId;
    const tz = ctx.timezone;
    const endOfToday = sql`((${ctx.today}::date + 1)::timestamp at time zone ${tz})`;
    const result = await this.db.tx.execute<Record<string, number>>(sql`
      with today_sessions as (
        select a.kind, a.meeting_url from appointments a
        where a.workspace_id = ${ws} and a.status in ('scheduled', 'confirmed', 'completed')
          and (a.starts_at at time zone ${tz})::date = ${ctx.today}::date
      )
      select
        (select count(*) from today_sessions)::int as total,
        (select count(*) from today_sessions where kind = 'trial')::int as trials,
        (select count(*) from today_sessions
          where kind <> 'trial' and (kind = 'online_session' or meeting_url is not null))::int as online,
        (select count(*) from clients c where c.workspace_id = ${ws} and c.status = 'active')::int as active_clients,
        (select count(*) from leads l where l.workspace_id = ${ws}
          and (l.created_at at time zone ${tz})::date > ${ctx.today}::date - 7)::int as new_leads,
        (select count(*) from lead_follow_ups f where f.workspace_id = ${ws} and f.status = 'open'
          and f.due_at < ${endOfToday})::int as follow_ups_due,
        (select count(*) from lead_follow_ups f where f.workspace_id = ${ws} and f.status = 'open'
          and f.due_at < now())::int as follow_ups_overdue,
        (select count(*) from check_ins ci where ci.workspace_id = ${ws}
          and ci.reviewed_at is null)::int as check_ins,
        (select count(*) from client_packages p where p.workspace_id = ${ws}
          and ${this.paymentDue(ctx.today)})::int as payments_due,
        (select count(*) from client_packages p where p.workspace_id = ${ws}
          and ${this.packageLow(ctx.today, ctx.low, ctx.warningDays)})::int as packages_expiring`);
    const row = result.rows[0] ?? {};
    const n = (key: string) => Number(row[key] ?? 0);
    return {
      sessions: {
        total: n("total"),
        trials: n("trials"),
        online: n("online"),
        inPerson: n("total") - n("trials") - n("online"),
      },
      activeClients: n("active_clients"),
      newLeads: n("new_leads"),
      followUps: { due: n("follow_ups_due"), overdue: n("follow_ups_overdue") },
      checkInsToReview: n("check_ins"),
      paymentsDue: n("payments_due"),
      packagesExpiring: n("packages_expiring"),
    };
  }

  // -------------------------------------------------------------------------------------------
  // Today's schedule
  // -------------------------------------------------------------------------------------------

  private async schedule(
    trainer: Trainer,
    tz: string,
    date: string,
  ): Promise<DashboardAppointment[]> {
    const result = await this.db.tx.execute<{
      id: string;
      kind: DashboardAppointment["kind"];
      status: DashboardAppointment["status"];
      starts_at: string;
      start_time: string;
      end_time: string;
      duration_min: number;
      client_id: string | null;
      lead_id: string | null;
      full_name: string;
      location: string | null;
      meeting_url: string | null;
      started: boolean;
      ended: boolean;
      workout_session_id: string | null;
    }>(sql`
      select a.id, a.kind, a.status, a.starts_at, a.duration_min, a.client_id, a.lead_id,
        a.location, a.meeting_url,
        to_char(a.starts_at at time zone ${tz}, 'HH24:MI') as start_time,
        to_char(a.ends_at at time zone ${tz}, 'HH24:MI') as end_time,
        coalesce(c.full_name, l.full_name) as full_name,
        a.starts_at <= now() as started, a.ends_at < now() as ended,
        (select w.id from workout_sessions w
          where w.workspace_id = a.workspace_id and w.client_id = a.client_id
            and w.scheduled_on = ${date}::date and w.status in ('planned', 'in_progress')
          order by w.workout_index limit 1) as workout_session_id
      from appointments a
      left join clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
      left join leads l on l.workspace_id = a.workspace_id and l.id = a.lead_id
      where a.workspace_id = ${trainer.workspaceId} and a.status <> 'cancelled'
        and (a.starts_at at time zone ${tz})::date = ${date}::date
      order by a.starts_at`);
    return result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      startsAt: new Date(row.starts_at).toISOString(),
      startTime: row.start_time,
      endTime: row.end_time,
      durationMin: Number(row.duration_min),
      person: row.client_id
        ? { kind: "client", id: row.client_id, fullName: row.full_name }
        : { kind: "lead", id: row.lead_id ?? "", fullName: row.full_name },
      location: row.location,
      meetingUrl: row.meeting_url,
      started: row.started,
      ended: row.ended,
      workoutSessionId: row.workout_session_id,
    }));
  }

  // -------------------------------------------------------------------------------------------
  // Needs attention (§8.1 order): one query per group, each capped, with the total count
  // -------------------------------------------------------------------------------------------

  private async attention(
    trainer: Trainer,
    ctx: {
      timezone: string;
      today: string;
      low: number;
      warningDays: number;
      noCheckInDays: number;
      noMeasurementDays: number;
    },
  ): Promise<Group[]> {
    const ws = trainer.workspaceId;
    const tz = ctx.timezone;
    const limit = ATTENTION_GROUP_LIMIT;
    const endOfToday = sql`((${ctx.today}::date + 1)::timestamp at time zone ${tz})`;
    type Row = Record<string, string | number | null> & { id: string; total: number };
    const run = async (query: ReturnType<typeof sql>) =>
      (await this.db.tx.execute<Row>(query)).rows;
    const groups: Group[] = [];
    const push = (
      kind: AttentionKind,
      rows: Row[],
      href: string,
      item: (row: Row) => AttentionItem,
    ) => {
      if (rows.length > 0) {
        groups.push({
          kind,
          count: Number(rows[0]?.total ?? rows.length),
          items: rows.map(item),
          href,
        });
      }
    };

    // 1–2. Follow-ups: overdue, then due later today.
    const followUps = (where: ReturnType<typeof sql>) => sql`
      select f.id, f.lead_id, f.action_type, l.full_name,
        to_char(f.due_at at time zone ${tz}, 'YYYY-MM-DD') as due_date,
        to_char(f.due_at at time zone ${tz}, 'HH24:MI') as due_time,
        count(*) over ()::int as total
      from lead_follow_ups f join leads l on l.workspace_id = f.workspace_id and l.id = f.lead_id
      where f.workspace_id = ${ws} and f.status = 'open' and ${where}
      order by f.due_at limit ${limit}`;
    const followUpItem = (row: Row): AttentionItem => ({
      id: row.id,
      title: String(row.full_name),
      detail: `${FOLLOW_UP_ACTION_LABELS[row.action_type as FollowUpAction] ?? "Follow-up"} · ${day(String(row.due_date))}, ${time(String(row.due_time))}`,
      href: `/app/leads/${String(row.lead_id)}`,
      whatsApp: null,
    });
    push(
      "follow_up_overdue",
      await run(followUps(sql`f.due_at < now()`)),
      "/app/leads?followUp=overdue",
      followUpItem,
    );
    push(
      "follow_up_today",
      await run(followUps(sql`f.due_at >= now() and f.due_at < ${endOfToday}`)),
      "/app/leads?followUp=today",
      followUpItem,
    );

    // 3. Trials in the next 48 hours.
    push(
      "trial_soon",
      await run(sql`
        select a.id, coalesce(l.full_name, c.full_name) as full_name,
          to_char(a.starts_at at time zone ${tz}, 'YYYY-MM-DD') as on_date,
          to_char(a.starts_at at time zone ${tz}, 'HH24:MI') as at_time,
          count(*) over ()::int as total
        from appointments a
        left join leads l on l.workspace_id = a.workspace_id and l.id = a.lead_id
        left join clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
        where a.workspace_id = ${ws} and a.kind = 'trial' and a.status in ('scheduled', 'confirmed')
          and a.starts_at >= now() and a.starts_at < now() + make_interval(hours => ${TRIAL_SOON_HOURS})
        order by a.starts_at limit ${limit}`),
      `/app/calendar?view=agenda`,
      (row) => ({
        id: row.id,
        title: String(row.full_name),
        detail: `Trial · ${day(String(row.on_date))}, ${time(String(row.at_time))}`,
        href: `/app/calendar?view=day&date=${String(row.on_date)}&appt=${row.id}`,
        whatsApp: null,
      }),
    );

    // 4. Payments due, with a WhatsApp reminder.
    const payments = await run(sql`
      select p.id, p.name as package_name, p.client_id, c.full_name, c.phone_e164,
        p.payment_due_on::text as due_on,
        (p.amount_due_paise - coalesce((
          select sum(x.amount_paise) from client_payments x
          where x.workspace_id = p.workspace_id and x.package_id = p.id and x.voids_id is null
            and not exists (select 1 from client_payments v where v.voids_id = x.id)
        ), 0))::text as balance,
        count(*) over ()::int as total
      from client_packages p join clients c on c.workspace_id = p.workspace_id and c.id = p.client_id
      where p.workspace_id = ${ws} and ${this.paymentDue(ctx.today)}
      order by p.payment_due_on, c.full_name limit ${limit}`);
    const paymentContext =
      payments.length > 0
        ? await this.whatsApp.context(ws, trainer.userId, "payment_reminder")
        : null;
    push("payment_due", payments, "/app/clients?attention=payment_due", (row) => {
      const amount = formatInr(Number(row.balance));
      return {
        id: row.id,
        title: String(row.full_name),
        detail: `${amount} due since ${day(String(row.due_on))} · ${String(row.package_name)}`,
        href: `/app/clients/${String(row.client_id)}?tab=packages`,
        whatsApp: this.link(paymentContext, row, {
          amount_due: amount,
          package_name: String(row.package_name),
        }),
      };
    });

    // 5. Packages with few sessions left or expiring soon, with a renewal reminder.
    const packages = await run(sql`
      select p.id, p.name as package_name, p.client_id, c.full_name, c.phone_e164,
        p.expires_on::text as expires_on, (${this.sessionsLeft()})::int as sessions_left,
        count(*) over ()::int as total
      from client_packages p join clients c on c.workspace_id = p.workspace_id and c.id = p.client_id
      where p.workspace_id = ${ws} and ${this.packageLow(ctx.today, ctx.low, ctx.warningDays)}
      order by coalesce(p.expires_on, '9999-12-31'::date), c.full_name limit ${limit}`);
    const renewalContext =
      packages.length > 0
        ? await this.whatsApp.context(ws, trainer.userId, "package_renewal")
        : null;
    push("package_low", packages, "/app/clients?attention=low_sessions", (row) => {
      const left = row.sessions_left === null ? null : Number(row.sessions_left);
      const expires = row.expires_on ? String(row.expires_on) : null;
      const parts = [
        left !== null ? `${left} session${left === 1 ? "" : "s"} left` : null,
        expires ? `${expires < ctx.today ? "expired" : "expires"} ${day(expires)}` : null,
      ].filter(Boolean);
      return {
        id: row.id,
        title: String(row.full_name),
        detail: `${parts.join(" · ")} · ${String(row.package_name)}`,
        href: `/app/clients/${String(row.client_id)}?tab=packages`,
        whatsApp: this.link(renewalContext, row, {
          sessions_left: left !== null ? String(left) : "",
          package_name: String(row.package_name),
        }),
      };
    });

    // 6. Check-ins to review.
    push(
      "check_in_review",
      await run(sql`
        select ci.id, c.full_name, ci.feeling, ci.local_date::text as on_date,
          count(*) over ()::int as total
        from check_ins ci join clients c on c.workspace_id = ci.workspace_id and c.id = ci.client_id
        where ci.workspace_id = ${ws} and ci.reviewed_at is null
        order by ci.local_date desc, ci.updated_at desc limit ${limit}`),
      "/app/check-ins",
      (row) => ({
        id: row.id,
        title: String(row.full_name),
        detail: `Felt ${FEELING_LABELS[row.feeling as Feeling]?.toLowerCase() ?? "—"} · ${day(String(row.on_date))} (self-reported)`,
        href: "/app/check-ins",
        whatsApp: null,
      }),
    );

    // 7. Past sessions still to mark attended.
    push(
      "attendance",
      await run(sql`
        select a.id, coalesce(c.full_name, l.full_name) as full_name, a.kind,
          to_char(a.starts_at at time zone ${tz}, 'YYYY-MM-DD') as on_date,
          to_char(a.starts_at at time zone ${tz}, 'HH24:MI') as at_time,
          count(*) over ()::int as total
        from appointments a
        left join clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
        left join leads l on l.workspace_id = a.workspace_id and l.id = a.lead_id
        where a.workspace_id = ${ws} and a.status in ('scheduled', 'confirmed')
          and a.ends_at < now() and a.starts_at >= now() - make_interval(days => ${ATTENDANCE_LOOKBACK_DAYS})
        order by a.starts_at desc limit ${limit}`),
      "/app/calendar?view=agenda",
      (row) => ({
        id: row.id,
        title: String(row.full_name),
        detail: `${row.kind === "trial" ? "Trial" : "Session"} · ${day(String(row.on_date))}, ${time(String(row.at_time))}`,
        href: `/app/calendar?view=day&date=${String(row.on_date)}&appt=${row.id}`,
        whatsApp: null,
      }),
    );

    // 8a. Active clients with check-ins on and none for N days (client for at least N days).
    push(
      "no_check_in",
      await run(sql`
        select c.id, c.full_name, last.on_date, count(*) over ()::int as total
        from clients c
        left join lateral (
          select max(ci.local_date)::text as on_date from check_ins ci
          where ci.workspace_id = c.workspace_id and ci.client_id = c.id
        ) last on true
        where c.workspace_id = ${ws} and c.status = 'active'
          and coalesce((c.features ->> 'checkIns')::boolean, false)
          and (c.onboarded_at at time zone ${tz})::date <= ${ctx.today}::date - ${ctx.noCheckInDays}::int
          and (last.on_date is null or last.on_date::date < ${ctx.today}::date - ${ctx.noCheckInDays}::int)
        order by last.on_date nulls first, c.full_name limit ${limit}`),
      "/app/clients",
      (row) => ({
        id: row.id,
        title: String(row.full_name),
        detail: row.on_date ? `Last check-in ${day(String(row.on_date))}` : "No check-in yet",
        href: `/app/clients/${row.id}?tab=check-ins`,
        whatsApp: null,
      }),
    );

    // 8b. Active clients with no live measurement for M days (client for at least M days).
    push(
      "no_measurement",
      await run(sql`
        select c.id, c.full_name, last.on_date, count(*) over ()::int as total
        from clients c
        left join lateral (
          select max(m.measured_on)::text as on_date from measurements m
          where m.workspace_id = c.workspace_id and m.client_id = c.id and m.voided_at is null
        ) last on true
        where c.workspace_id = ${ws} and c.status = 'active'
          and (c.onboarded_at at time zone ${tz})::date <= ${ctx.today}::date - ${ctx.noMeasurementDays}::int
          and (last.on_date is null or last.on_date::date < ${ctx.today}::date - ${ctx.noMeasurementDays}::int)
        order by last.on_date nulls first, c.full_name limit ${limit}`),
      "/app/clients",
      (row) => ({
        id: row.id,
        title: String(row.full_name),
        detail: row.on_date ? `Last measured ${day(String(row.on_date))}` : "No measurements yet",
        href: `/app/clients/${row.id}?tab=progress`,
        whatsApp: null,
      }),
    );
    return groups;
  }

  private link(
    context: MessageContext | null,
    row: Record<string, unknown>,
    values: Record<string, string>,
  ) {
    if (!context) return null;
    return this.whatsApp.build(
      context,
      {
        fullName: String(row.full_name),
        phoneE164: typeof row.phone_e164 === "string" ? row.phone_e164 : null,
      },
      values,
    );
  }

  // -------------------------------------------------------------------------------------------
  // Recent activity and the first-run checklist
  // -------------------------------------------------------------------------------------------

  private async activity(trainer: Trainer): Promise<DashboardSummary["activity"]> {
    const result = await this.db.tx.execute<{
      id: string;
      type: ClientActivityType;
      data: Record<string, unknown>;
      created_at: string;
      client_id: string | null;
      full_name: string | null;
    }>(sql`
      select e.id, e.type, e.data, e.created_at, e.client_id, c.full_name
      from activity_events e
      left join clients c on c.workspace_id = e.workspace_id and c.id = e.client_id
      where e.workspace_id = ${trainer.workspaceId}
      order by e.created_at desc limit 10`);
    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      data: row.data ?? {},
      createdAt: new Date(row.created_at).toISOString(),
      client:
        row.client_id && row.full_name ? { id: row.client_id, fullName: row.full_name } : null,
    }));
  }

  /** Each step ticks itself from real data (§8.1). */
  private async checklist(
    trainer: Trainer,
    dismissed: boolean,
  ): Promise<DashboardSummary["checklist"]> {
    const ws = trainer.workspaceId;
    const result = await this.db.tx.execute<Record<string, boolean>>(sql`
      select
        exists (select 1 from trainer_public_pages p where p.workspace_id = ${ws} and p.is_published) as public_page,
        (exists (select 1 from leads l where l.workspace_id = ${ws})
          or exists (select 1 from clients c where c.workspace_id = ${ws})) as first_person,
        exists (select 1 from client_program_assignments a where a.workspace_id = ${ws}) as program,
        exists (select 1 from client_invites i where i.workspace_id = ${ws}) as invite`);
    const row = result.rows[0] ?? {};
    const steps = (["public_page", "first_person", "program", "invite"] as const).map((key) => ({
      key,
      done: Boolean(row[key]),
    }));
    return { visible: !dismissed && steps.some((step) => !step.done), steps };
  }
}
