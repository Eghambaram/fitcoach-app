import { Injectable } from "@nestjs/common";
import { FOLLOW_UP_ACTION_LABELS } from "@fitcoach/shared";
import { sql } from "drizzle-orm";
import type { Tx } from "../../db/database";
import { SystemDb } from "../../db/system-db";
import { JobsService } from "../jobs/jobs.service";

/** Workspaces whose trainers get notifications: not suspended, pending or cancelled. */
const LIVE_WORKSPACE = sql`w.status in ('trialing', 'active', 'past_due')`;
/** Insert-once (step 5.2): the recipient + dedupe key is unique. */
const ONCE = sql`on conflict (recipient_user_id, dedupe_key) do nothing`;

/** SQL CASE turning a follow-up action into its label (same words as the app). */
const ACTION_LABEL = sql.raw(
  `case f.action_type ${Object.entries(FOLLOW_UP_ACTION_LABELS)
    .map(([key, label]) => `when '${key}' then '${label.replace(/'/g, "''")}'`)
    .join(" ")} else 'Follow-up' end`,
);

const count = async (tx: Tx, query: ReturnType<typeof sql>) =>
  (await tx.execute(query)).rowCount ?? 0;

/**
 * Time-based trainer notifications (PROMPT §8.10, §13), run by pg-boss across workspaces, so through
 * fitcoach_system. Every insert is keyed (`follow_up:<id>`, `package_low:<id>`, …), which makes each
 * job idempotent: a retry, an overlapping replica or a restart never notifies twice.
 */
@Injectable()
export class NotificationJobsService {
  constructor(
    private readonly systemDb: SystemDb,
    jobs: JobsService,
  ) {
    jobs.registerRecurring({
      name: "notifications.follow-ups",
      cron: "*/5 * * * *",
      handler: async () => ({ created: await this.followUps() }),
    });
    jobs.registerRecurring({
      name: "notifications.trials",
      cron: "*/5 * * * *",
      handler: async () => ({ created: await this.trials() }),
    });
    jobs.registerRecurring({
      name: "notifications.attendance",
      cron: "7 * * * *",
      handler: async () => ({ created: await this.attendance() }),
    });
    // Hourly in UTC; each workspace is handled when it's 07:00 there (§13).
    jobs.registerRecurring({
      name: "packages.daily",
      cron: "0 * * * *",
      handler: () => this.packages(7),
    });
  }

  /** Open follow-ups whose time has come (due or overdue), from the last 7 days. */
  followUps(): Promise<number> {
    return this.systemDb.run("notifications: follow-ups due", (tx) =>
      count(
        tx,
        sql`
        insert into notifications (workspace_id, recipient_user_id, type, title, body, link, data, dedupe_key)
        select f.workspace_id, w.owner_user_id, 'follow_up_due',
          'Follow-up due: ' || l.full_name,
          ${ACTION_LABEL} || ' · ' || to_char(f.due_at at time zone w.timezone, 'FMDD Mon, FMHH12:MI am'),
          '/app/leads/' || l.id, jsonb_build_object('leadId', l.id, 'followUpId', f.id),
          'follow_up:' || f.id
        from lead_follow_ups f
        join leads l on l.workspace_id = f.workspace_id and l.id = f.lead_id
        join workspaces w on w.id = f.workspace_id
        where f.status = 'open' and f.due_at <= now() and f.due_at > now() - interval '7 days'
          and l.archived_at is null and ${LIVE_WORKSPACE}
        ${ONCE}`,
      ),
    );
  }

  /** Trials starting within the next 2 hours. */
  trials(): Promise<number> {
    return this.systemDb.run("notifications: trials in 2 hours", (tx) =>
      count(
        tx,
        sql`
        insert into notifications (workspace_id, recipient_user_id, type, title, body, link, data, dedupe_key)
        select a.workspace_id, w.owner_user_id, 'trial_soon',
          'Trial soon: ' || coalesce(l.full_name, c.full_name),
          'Starts at ' || to_char(a.starts_at at time zone w.timezone, 'FMHH12:MI am'),
          '/app/calendar?view=day&date=' || to_char(a.starts_at at time zone w.timezone, 'YYYY-MM-DD') || '&appt=' || a.id,
          jsonb_build_object('appointmentId', a.id), 'trial:' || a.id
        from appointments a
        join workspaces w on w.id = a.workspace_id
        left join leads l on l.workspace_id = a.workspace_id and l.id = a.lead_id
        left join clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
        where a.kind = 'trial' and a.status in ('scheduled', 'confirmed')
          and a.starts_at > now() and a.starts_at <= now() + interval '2 hours' and ${LIVE_WORKSPACE}
        ${ONCE}`,
      ),
    );
  }

  /** Sessions that ended in the last 2 days and are still unmarked. */
  attendance(): Promise<number> {
    return this.systemDb.run("notifications: sessions needing attendance", (tx) =>
      count(
        tx,
        sql`
        insert into notifications (workspace_id, recipient_user_id, type, title, body, link, data, dedupe_key)
        select a.workspace_id, w.owner_user_id, 'attendance_needed',
          'Mark attendance: ' || coalesce(c.full_name, l.full_name),
          to_char(a.starts_at at time zone w.timezone, 'Dy FMDD Mon, FMHH12:MI am'),
          '/app/calendar?view=day&date=' || to_char(a.starts_at at time zone w.timezone, 'YYYY-MM-DD') || '&appt=' || a.id,
          jsonb_build_object('appointmentId', a.id), 'attendance:' || a.id
        from appointments a
        join workspaces w on w.id = a.workspace_id
        left join clients c on c.workspace_id = a.workspace_id and c.id = a.client_id
        left join leads l on l.workspace_id = a.workspace_id and l.id = a.lead_id
        where a.status in ('scheduled', 'confirmed') and a.ends_at < now()
          and a.ends_at > now() - interval '2 days' and ${LIVE_WORKSPACE}
        ${ONCE}`,
      ),
    );
  }

  /**
   * Daily package work for workspaces where it's `atLocalHour` (null = every workspace, for tests):
   * close packages past their expiry date, then notify low sessions, expiring soon and payment due.
   */
  packages(atLocalHour: number | null): Promise<Record<string, number>> {
    const due =
      atLocalHour === null
        ? sql`true`
        : sql`extract(hour from now() at time zone w.timezone) = ${atLocalHour}`;
    return this.systemDb.run("packages: daily expiry and alerts", async (tx) => {
      const today = sql`(now() at time zone w.timezone)::date`;
      const left = sql`p.sessions_included - coalesce((select sum(l.sessions_used)
        from package_session_ledger l where l.workspace_id = p.workspace_id and l.package_id = p.id), 0)`;
      const balance = sql`p.amount_due_paise - coalesce((select sum(x.amount_paise) from client_payments x
        where x.workspace_id = p.workspace_id and x.package_id = p.id and x.voids_id is null
          and not exists (select 1 from client_payments v where v.voids_id = x.id)), 0)`;
      const scope = sql`from client_packages p
        join workspaces w on w.id = p.workspace_id
        join trainer_settings s on s.workspace_id = p.workspace_id
        join clients c on c.workspace_id = p.workspace_id and c.id = p.client_id
        where p.status = 'active' and ${LIVE_WORKSPACE} and ${due}`;

      const expired = await count(
        tx,
        sql`update client_packages p set status = 'expired', closed_at = now(), closed_reason = 'Expired'
          from workspaces w
          where w.id = p.workspace_id and p.status = 'active' and p.expires_on < ${today} and ${due}`,
      );
      const low = await count(
        tx,
        sql`insert into notifications (workspace_id, recipient_user_id, type, title, body, link, data, dedupe_key)
          select p.workspace_id, w.owner_user_id, 'package_low',
            c.full_name || ': ' || (${left}) || ' session' || case when (${left}) = 1 then '' else 's' end || ' left',
            p.name, '/app/clients/' || c.id || '?tab=packages',
            jsonb_build_object('packageId', p.id), 'package_low:' || p.id
          ${scope} and p.kind = 'session_pack' and (${left}) <= s.low_sessions_threshold
          ${ONCE}`,
      );
      const expiring = await count(
        tx,
        sql`insert into notifications (workspace_id, recipient_user_id, type, title, body, link, data, dedupe_key)
          select p.workspace_id, w.owner_user_id, 'package_expiring',
            c.full_name || ': package expires ' || to_char(p.expires_on, 'FMDD Mon'),
            p.name, '/app/clients/' || c.id || '?tab=packages',
            jsonb_build_object('packageId', p.id), 'package_expiring:' || p.id || ':' || p.expires_on
          ${scope} and p.expires_on between ${today} and ${today} + s.expiry_warning_days
          ${ONCE}`,
      );
      const payments = await count(
        tx,
        sql`insert into notifications (workspace_id, recipient_user_id, type, title, body, link, data, dedupe_key)
          select p.workspace_id, w.owner_user_id, 'payment_due',
            c.full_name || ': payment due',
            p.name || ' · due ' || to_char(p.payment_due_on, 'FMDD Mon'),
            '/app/clients/' || c.id || '?tab=packages',
            jsonb_build_object('packageId', p.id), 'payment_due:' || p.id || ':' || p.payment_due_on
          ${scope} and p.payment_due_on is not null and p.payment_due_on <= ${today} and (${balance}) > 0
          ${ONCE}`,
      );
      return { expired, low, expiring, payments };
    });
  }
}
