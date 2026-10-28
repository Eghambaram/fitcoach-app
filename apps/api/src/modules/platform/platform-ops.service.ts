import { Injectable } from "@nestjs/common";
import {
  AUDIT_PAGE_SIZE,
  type BetaInvite,
  type CreateBetaInviteRequest,
  type CreateBetaInviteResponse,
  type FeedbackStatus,
  type HealthItem,
  type PlatformAuditListResponse,
  type PlatformAuditQuery,
  type PlatformFeedbackListResponse,
  type PlatformHealth,
} from "@fitcoach/shared";
import { and, eq, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { AppConfig } from "../../config/env";
import { PGBOSS_SCHEMA } from "../../db/run-migrations";
import { feedback } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { EmailService } from "../../integrations/email/email.service";
import { StorageService } from "../../integrations/storage/storage.service";
import { BackupsService } from "../backups/backups.service";
import { recordAudit } from "../audit/audit.service";
import {
  type BetaInviteSummary,
  createBetaInvite,
  listBetaInvites,
  revokeBetaInvite,
} from "./beta-invites";

type Row = Record<string, unknown>;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A queued job waiting longer than this means the workers aren't keeping up. */
const QUEUE_LAG_DEGRADED_SECONDS = 5 * 60;

const iso = (value: unknown): string => new Date(String(value)).toISOString();

function inviteStatus(invite: BetaInviteSummary): BetaInvite["status"] {
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() <= Date.now()) return "expired";
  if (invite.uses >= invite.maxUses) return "used_up";
  return "active";
}

const toInvite = (invite: BetaInviteSummary): BetaInvite => ({
  id: invite.id,
  label: invite.label,
  uses: invite.uses,
  maxUses: invite.maxUses,
  expiresAt: invite.expiresAt.toISOString(),
  revokedAt: invite.revokedAt?.toISOString() ?? null,
  createdAt: invite.createdAt.toISOString(),
  status: inviteStatus(invite),
});

/**
 * Beta invites, the feedback inbox, system health and the audit log (PROMPT §16.0). Platform-wide,
 * so fitcoach_system; changes are audited. Feedback text is the trainer's own words to us.
 */
@Injectable()
export class PlatformOpsService {
  constructor(
    private readonly systemDb: SystemDb,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: AppConfig,
    private readonly storage: StorageService,
    private readonly email: EmailService,
    private readonly backups: BackupsService,
  ) {}

  private owner(): AuthContext {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "platform_owner" || auth.aal !== 2) throw DomainError.forbidden();
    return auth;
  }

  // -------------------------------------------------------------------------------------------
  // Beta invites (same service as `pnpm beta:invite`, ADR-0029)
  // -------------------------------------------------------------------------------------------

  async invites(): Promise<BetaInvite[]> {
    this.owner();
    const rows = await this.systemDb.run("platform: list beta invites", (tx) =>
      listBetaInvites(tx),
    );
    return rows.map(toInvite);
  }

  async createInvite(input: CreateBetaInviteRequest): Promise<CreateBetaInviteResponse> {
    const auth = this.owner();
    const created = await this.systemDb.run("platform: create a beta invite", (tx) =>
      createBetaInvite(tx, this.config.sessionSecret, {
        maxUses: input.maxUses,
        expiresAt: new Date(Date.now() + input.expiresInDays * DAY_MS),
        label: input.label || undefined,
        createdBy: auth.userId,
      }),
    );
    const invite = (await this.invites()).find((item) => item.id === created.id);
    if (!invite) throw new Error("created invite not found");
    return { code: created.code, invite };
  }

  async revokeInvite(id: string): Promise<BetaInvite[]> {
    const auth = this.owner();
    const revoked = await this.systemDb.run("platform: revoke a beta invite", (tx) =>
      revokeBetaInvite(tx, id, auth.userId),
    );
    if (!revoked) throw DomainError.notFound("That invite doesn't exist or is already revoked.");
    return this.invites();
  }

  // -------------------------------------------------------------------------------------------
  // Feedback inbox
  // -------------------------------------------------------------------------------------------

  async feedback(status?: FeedbackStatus): Promise<PlatformFeedbackListResponse> {
    this.owner();
    return this.systemDb.run("platform: read the feedback inbox", async (tx) => {
      const rows = (
        await tx.execute<Row>(sql`
          select f.id, f.workspace_id, w.name as business_name, p.display_name, f.page, f.message,
            f.status, f.created_at
          from feedback f
          join workspaces w on w.id = f.workspace_id
          left join profiles p on p.user_id = f.user_id
          where (${status ?? null}::text is null or f.status = ${status ?? null})
          order by f.created_at desc
          limit 200`)
      ).rows;
      const [counts] = (
        await tx.execute<Row>(sql`
          select count(*) filter (where status = 'open') as open,
            count(*) filter (where status = 'triaged') as triaged,
            count(*) filter (where status = 'closed') as closed
          from feedback`)
      ).rows;
      return {
        items: rows.map((row) => ({
          id: String(row.id),
          workspaceId: String(row.workspace_id),
          businessName: String(row.business_name),
          trainerName: row.display_name === null ? null : String(row.display_name),
          page: row.page === null ? null : String(row.page),
          message: String(row.message),
          status: row.status as FeedbackStatus,
          createdAt: iso(row.created_at),
        })),
        counts: {
          open: Number(counts?.open ?? 0),
          triaged: Number(counts?.triaged ?? 0),
          closed: Number(counts?.closed ?? 0),
        },
      };
    });
  }

  async updateFeedback(id: string, status: FeedbackStatus): Promise<void> {
    const auth = this.owner();
    await this.systemDb.run("platform: triage feedback", async (tx) => {
      const [before] = await tx
        .select({ status: feedback.status, workspaceId: feedback.workspaceId })
        .from(feedback)
        .where(eq(feedback.id, id))
        .for("update");
      if (!before) throw DomainError.notFound("That feedback doesn't exist.");
      if (before.status === status) return;
      await tx
        .update(feedback)
        .set({ status })
        .where(and(eq(feedback.id, id)));
      await recordAudit(tx, {
        actorKind: "platform_owner",
        actorUserId: auth.userId,
        workspaceId: before.workspaceId,
        action: "feedback.status_changed",
        targetType: "feedback",
        targetId: id,
        before: { status: before.status },
        after: { status },
      });
    });
  }

  // -------------------------------------------------------------------------------------------
  // Health: OK / Degraded / Unknown, never a guess
  // -------------------------------------------------------------------------------------------

  async health(): Promise<PlatformHealth> {
    this.owner();
    const [database, jobs, email, storage, budget, backups] = await Promise.all([
      this.databaseHealth(),
      this.jobsHealth(),
      this.emailHealth(),
      this.storageHealth(),
      this.budgetHealth(),
      this.backups.health(),
    ]);
    const failedJobs = await this.systemDb
      .run(
        "platform: recent failed jobs",
        async (tx) =>
          (
            await tx.execute<Row>(sql`
            select name, started_at, error from job_runs
            where status = 'failed' and started_at > now() - interval '24 hours'
            order by started_at desc limit 20`)
          ).rows,
      )
      .catch(() => []);
    return {
      checkedAt: new Date().toISOString(),
      database,
      jobs,
      backups,
      email,
      storage,
      storageBudget: budget,
      failedJobs: failedJobs.map((row) => ({
        name: String(row.name),
        startedAt: iso(row.started_at),
        error: row.error === null ? null : String(row.error),
      })),
    };
  }

  private async databaseHealth(): Promise<HealthItem> {
    const startedAt = Date.now();
    try {
      await this.systemDb.run("platform: database health probe", (tx) => tx.execute(sql`select 1`));
      return { status: "ok", detail: `Responded in ${Date.now() - startedAt} ms.` };
    } catch {
      return { status: "degraded", detail: "The database didn't respond." };
    }
  }

  private async jobsHealth(): Promise<HealthItem> {
    try {
      return await this.systemDb.run("platform: job queue health", async (tx) => {
        const [runs] = (
          await tx.execute<Row>(sql`
            select count(*) filter (where status = 'failed') as failed,
              count(*) filter (where status = 'succeeded') as succeeded,
              max(started_at) filter (where status = 'succeeded') as last_success
            from job_runs where started_at > now() - interval '24 hours'`)
        ).rows;
        const [lag] = (
          await tx.execute<Row>(sql`
            select extract(epoch from now() - min(start_after))::int as seconds
            from ${sql.identifier(PGBOSS_SCHEMA)}.job
            where state = 'created' and start_after < now()`)
        ).rows;
        const failed = Number(runs?.failed ?? 0);
        const succeeded = Number(runs?.succeeded ?? 0);
        const lagSeconds =
          lag?.seconds === null || lag?.seconds === undefined ? 0 : Number(lag.seconds);
        if (succeeded === 0 && failed === 0) {
          return { status: "unknown", detail: "No job has run in the last 24 hours." };
        }
        const summary = `${succeeded} succeeded, ${failed} failed in 24 h; oldest waiting job ${lagSeconds} s.`;
        return {
          status: failed > 0 || lagSeconds > QUEUE_LAG_DEGRADED_SECONDS ? "degraded" : "ok",
          detail: summary,
        };
      });
    } catch {
      return { status: "unknown", detail: "The job queue couldn't be read." };
    }
  }

  private async emailHealth(): Promise<HealthItem> {
    if (this.email.providerName === "console") {
      return {
        status: "not_configured",
        detail: "Emails are written to the local outbox, not sent (console provider).",
      };
    }
    try {
      return await this.systemDb.run("platform: email delivery health", async (tx) => {
        const [row] = (
          await tx.execute<Row>(sql`
            select count(*) filter (where status = 'sent') as sent,
              count(*) filter (where status = 'failed') as failed
            from notification_deliveries
            where channel = 'email' and created_at > now() - interval '24 hours'`)
        ).rows;
        const sent = Number(row?.sent ?? 0);
        const failed = Number(row?.failed ?? 0);
        if (sent === 0 && failed === 0) {
          return {
            status: "unknown",
            detail: `${this.email.providerName}: no email sent in the last 24 hours.`,
          };
        }
        return {
          status: failed > 0 ? "degraded" : "ok",
          detail: `${this.email.providerName}: ${sent} sent, ${failed} failed attempts in 24 h.`,
        };
      });
    } catch {
      return { status: "unknown", detail: "Email deliveries couldn't be read." };
    }
  }

  private async storageHealth(): Promise<HealthItem> {
    const check = await this.storage.check();
    if (check.status === "not_configured") {
      return { status: "not_configured", detail: "STORAGE_* isn't set, so uploads are off." };
    }
    return check.status === "ok"
      ? { status: "ok", detail: `Both buckets answered in ${check.latencyMs ?? 0} ms.` }
      : { status: "degraded", detail: "A bucket didn't answer, or the storage budget is reached." };
  }

  private async budgetHealth(): Promise<PlatformHealth["storageBudget"]> {
    if (!this.storage.configured) {
      return {
        status: "not_configured",
        detail: "No object storage.",
        usedBytes: null,
        budgetBytes: null,
        hardLimitBytes: null,
      };
    }
    try {
      const usage = await this.storage.usage({ fresh: true });
      const status = usage.usedBytes >= usage.budgetBytes ? "degraded" : "ok";
      return {
        status,
        detail:
          status === "ok"
            ? "Under the budget."
            : "Over the soft budget: new uploads stop at the hard limit.",
        ...usage,
      };
    } catch {
      return {
        status: "unknown",
        detail: "The files ledger couldn't be read.",
        usedBytes: null,
        budgetBytes: null,
        hardLimitBytes: null,
      };
    }
  }

  // -------------------------------------------------------------------------------------------
  // Audit log (immutable: read-only here and for everyone)
  // -------------------------------------------------------------------------------------------

  async audit(query: PlatformAuditQuery): Promise<PlatformAuditListResponse> {
    this.owner();
    const [beforeAt, beforeId] = (query.before ?? "").split("|");
    const cursorValid =
      beforeAt !== undefined &&
      beforeId !== undefined &&
      !Number.isNaN(Date.parse(beforeAt)) &&
      /^[0-9a-f-]{36}$/.test(beforeId);
    const rows = await this.systemDb.run(
      "platform: read the audit log",
      async (tx) =>
        (
          await tx.execute<Row>(sql`
          select a.id, a.occurred_at, a.occurred_at::text as occurred_text, a.actor_kind, p.display_name, a.workspace_id,
            w.name as business_name, a.action, a.target_type, a.target_id, a.reason
          from audit_logs a
          left join profiles p on p.user_id = a.actor_user_id
          left join workspaces w on w.id = a.workspace_id
          where (${query.action ?? null}::text is null or a.action = ${query.action ?? null})
            and (${query.actorKind ?? null}::text is null or a.actor_kind = ${query.actorKind ?? null})
            and (${query.workspaceId ?? null}::uuid is null or a.workspace_id = ${query.workspaceId ?? null})
            and (${cursorValid ? beforeAt : null}::timestamptz is null
              or (a.occurred_at, a.id) < (${cursorValid ? beforeAt : null}::timestamptz, ${cursorValid ? beforeId : null}::uuid))
          order by a.occurred_at desc, a.id desc
          limit ${AUDIT_PAGE_SIZE + 1}`)
        ).rows,
    );
    const page = rows.slice(0, AUDIT_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: String(row.id),
        occurredAt: iso(row.occurred_at),
        actorKind: String(row.actor_kind),
        actorName: row.display_name === null ? null : String(row.display_name),
        workspaceId: row.workspace_id === null ? null : String(row.workspace_id),
        businessName: row.business_name === null ? null : String(row.business_name),
        action: String(row.action),
        targetType: row.target_type === null ? null : String(row.target_type),
        targetId: row.target_id === null ? null : String(row.target_id),
        reason: row.reason === null ? null : String(row.reason),
      })),
      nextCursor:
        rows.length > AUDIT_PAGE_SIZE && last
          ? `${String(last.occurred_text)}|${String(last.id)}`
          : null,
    };
  }
}
