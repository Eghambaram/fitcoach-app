import { Injectable } from "@nestjs/common";
import {
  ERROR_CODES,
  type PlatformOverview,
  type PlatformPlanUpdate,
  type PlatformTrainer,
  type PlatformTrainerDetail,
  type PlatformTrainerListResponse,
  type PlatformTrainerQuery,
  type WorkspaceStatus,
} from "@fitcoach/shared";
import { eq, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { AppConfig } from "../../config/env";
import type { Tx } from "../../db/database";
import { subscriptionPlans, workspacePlans, workspaces } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { EmailService } from "../../integrations/email/email.service";
import { accountApprovedMessage, resetPasswordMessage } from "../../integrations/email/templates";
import { recordAudit } from "../audit/audit.service";
import { issueAuthToken } from "../auth/auth-tokens";
import { SessionsService } from "../auth/sessions.service";
import { notify } from "../notifications/notify";

const LIST_LIMIT = 100;
/** Activation window (§1A.5). */
const ACTIVATION_DAYS = 7;
const ACTIVATION_MIN_CLIENTS = 3;

type Row = Record<string, unknown>;
const iso = (value: unknown): string | null =>
  value === null || value === undefined ? null : new Date(String(value)).toISOString();
const num = (value: unknown): number => Number(value ?? 0);

const trainerNotFound = () => DomainError.notFound("That trainer doesn't exist.");

/**
 * Platform owner view of trainers (PROMPT §16.0). Spans every workspace, so fitcoach_system — and
 * only trainer account details and counts leave here, never a client's name or data (rule 8).
 * Every change is audited with the owner as actor and, where the spec asks, a reason.
 */
@Injectable()
export class PlatformTrainersService {
  constructor(
    private readonly systemDb: SystemDb,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: AppConfig,
    private readonly sessions: SessionsService,
    private readonly email: EmailService,
  ) {}

  private owner(): AuthContext {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "platform_owner" || auth.aal !== 2) throw DomainError.forbidden();
    return auth;
  }

  async overview(): Promise<PlatformOverview> {
    this.owner();
    return this.systemDb.run("platform: overview counts", async (tx) => {
      const [counts] = (
        await tx.execute<Row>(sql`
          select
            (select count(*) from workspaces where status <> 'cancelled') as total,
            (select count(distinct w.id) from workspaces w
               join sessions s on s.user_id = w.owner_user_id and s.actor = 'trainer'
               where w.status <> 'cancelled' and s.last_seen_at > now() - interval '7 days') as active_week,
            (select count(*) from workspaces where status = 'suspended') as suspended,
            (select count(*) from workspaces where status = 'pending_approval') as pending,
            (select count(*) from clients c join workspaces w on w.id = c.workspace_id
               where c.status = 'active' and w.status <> 'cancelled') as active_clients,
            (select count(*) from product_events where event = 'client_invite_accepted') as invites_accepted,
            (select count(*) from feedback where status = 'open') as feedback_open,
            (select count(*) from job_runs where status = 'failed'
               and started_at > now() - interval '24 hours') as failed_jobs`)
      ).rows;
      // §1A.5: within 7 days of signup — page published, ≥ 3 onboarded clients, ≥ 1 program assigned.
      const [activation] = (
        await tx.execute<Row>(sql`
          with eligible as (
            select w.id, w.created_at from workspaces w
            where w.status <> 'cancelled'
              and w.created_at <= now() - make_interval(days => ${ACTIVATION_DAYS})
          )
          select
            count(*) as eligible,
            count(*) filter (where
              exists (select 1 from product_events e where e.workspace_id = eligible.id
                and e.event = 'public_page_published'
                and e.occurred_at <= eligible.created_at + make_interval(days => ${ACTIVATION_DAYS}))
              and (select count(*) from clients c where c.workspace_id = eligible.id
                and c.onboarded_at <= eligible.created_at + make_interval(days => ${ACTIVATION_DAYS}))
                >= ${ACTIVATION_MIN_CLIENTS}
              and exists (select 1 from product_events e where e.workspace_id = eligible.id
                and e.event = 'program_assigned'
                and e.occurred_at <= eligible.created_at + make_interval(days => ${ACTIVATION_DAYS}))
            ) as activated
          from eligible`)
      ).rows;
      const recent = (
        await tx.execute<Row>(sql`
          select w.id, w.name, w.status, w.created_at, p.display_name
          from workspaces w join profiles p on p.user_id = w.owner_user_id
          order by (w.status = 'pending_approval') desc, w.created_at desc
          limit 8`)
      ).rows;
      const eligible = num(activation?.eligible);
      const activated = num(activation?.activated);
      return {
        trainers: {
          total: num(counts?.total),
          activeThisWeek: num(counts?.active_week),
          suspended: num(counts?.suspended),
          pendingApproval: num(counts?.pending),
        },
        activeClients: num(counts?.active_clients),
        activation: { eligible, activated, rate: eligible === 0 ? null : activated / eligible },
        invitesAccepted: num(counts?.invites_accepted),
        feedbackOpen: num(counts?.feedback_open),
        failedJobs24h: num(counts?.failed_jobs),
        recentSignups: recent.map((row) => ({
          workspaceId: String(row.id),
          businessName: String(row.name),
          ownerName: String(row.display_name),
          status: row.status as WorkspaceStatus,
          createdAt: iso(row.created_at) ?? "",
        })),
      };
    });
  }

  async list(query: PlatformTrainerQuery): Promise<PlatformTrainerListResponse> {
    this.owner();
    const search = query.q ? `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const order =
      query.sort === "oldest"
        ? sql`w.created_at asc`
        : query.sort === "last_active"
          ? sql`last_active desc nulls last`
          : sql`w.created_at desc`;
    const rows = await this.systemDb.run(
      "platform: list trainers",
      async (tx) =>
        (
          await tx.execute<Row>(sql`
          select w.id, w.name, w.slug, w.status, w.city, w.created_at,
            p.display_name, u.email,
            (select max(s.last_seen_at) from sessions s
              where s.user_id = w.owner_user_id and s.actor = 'trainer') as last_active,
            (select count(*) from clients c where c.workspace_id = w.id and c.status = 'active')
              as active_clients
          from workspaces w
          join users u on u.id = w.owner_user_id
          join profiles p on p.user_id = w.owner_user_id
          where (${query.status ?? null}::text is null or w.status = ${query.status ?? null})
            and (${search}::text is null or w.name ilike ${search} or p.display_name ilike ${search}
              or u.email::text ilike ${search} or w.slug::text ilike ${search})
          order by ${order}, w.id
          limit ${LIST_LIMIT}`)
        ).rows,
    );
    return { items: rows.map(toTrainer), limit: LIST_LIMIT };
  }

  async detail(workspaceId: string): Promise<PlatformTrainerDetail> {
    this.owner();
    return this.systemDb.run("platform: trainer detail (counts only)", async (tx) => {
      const [row] = (
        await tx.execute<Row>(sql`
          select w.id, w.name, w.slug, w.status, w.city, w.created_at, w.timezone,
            p.display_name, u.email, u.email_verified_at,
            (select max(s.last_seen_at) from sessions s
              where s.user_id = w.owner_user_id and s.actor = 'trainer') as last_active,
            (select count(*) from sessions s where s.user_id = w.owner_user_id
              and s.revoked_at is null and s.expires_at > now()) as active_sessions,
            (select count(*) from clients c where c.workspace_id = w.id and c.status = 'active')
              as active_clients,
            (select count(*) from leads where workspace_id = w.id) as leads,
            (select count(*) from clients where workspace_id = w.id) as clients,
            (select count(*) from appointments where workspace_id = w.id) as appointments,
            (select count(*) from workout_sessions where workspace_id = w.id
              and status = 'completed') as workouts,
            exists (select 1 from trainer_public_pages pp where pp.workspace_id = w.id
              and pp.is_published) as public_page,
            (exists (select 1 from leads l where l.workspace_id = w.id)
              or exists (select 1 from clients c where c.workspace_id = w.id)) as first_person,
            exists (select 1 from client_program_assignments a where a.workspace_id = w.id) as program,
            exists (select 1 from client_invites i where i.workspace_id = w.id) as invite,
            wp.plan_id, sp.name as plan_name, wp.max_active_clients, wp.trial_ends_at
          from workspaces w
          join users u on u.id = w.owner_user_id
          join profiles p on p.user_id = w.owner_user_id
          left join workspace_plans wp on wp.workspace_id = w.id
          left join subscription_plans sp on sp.id = wp.plan_id
          where w.id = ${workspaceId}`)
      ).rows;
      if (!row) throw trainerNotFound();
      const plans = await tx
        .select({ id: subscriptionPlans.id, name: subscriptionPlans.name })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.isActive, true));
      return {
        ...toTrainer(row),
        emailVerified: row.email_verified_at !== null,
        timezone: String(row.timezone),
        checklist: {
          publicPagePublished: row.public_page === true,
          hasLeadOrClient: row.first_person === true,
          programAssigned: row.program === true,
          clientInvited: row.invite === true,
        },
        plan: row.plan_id
          ? {
              planId: String(row.plan_id),
              planName: String(row.plan_name),
              maxActiveClients: num(row.max_active_clients),
              trialEndsAt: iso(row.trial_ends_at),
            }
          : null,
        usage: {
          leads: num(row.leads),
          clients: num(row.clients),
          appointments: num(row.appointments),
          workouts: num(row.workouts),
        },
        activeSessions: num(row.active_sessions),
        plans,
      };
    });
  }

  // -------------------------------------------------------------------------------------------
  // Actions — each one audited
  // -------------------------------------------------------------------------------------------

  async approve(workspaceId: string): Promise<PlatformTrainerDetail> {
    const auth = this.owner();
    const approved = await this.systemDb.run("platform: approve a pending signup", async (tx) => {
      const workspace = await this.lock(tx, workspaceId);
      if (workspace.status !== "pending_approval") {
        throw new DomainError(
          ERROR_CODES.CONFLICT_STATE,
          409,
          "This trainer isn't waiting for approval.",
        );
      }
      await tx.update(workspaces).set({ status: "active" }).where(eq(workspaces.id, workspaceId));
      await this.audit(tx, auth, workspaceId, "workspace.approved", null, {
        status: { from: "pending_approval", to: "active" },
      });
      await notify(tx, {
        workspaceId,
        recipientUserId: workspace.ownerUserId,
        type: "account_approved",
        title: "Your account is approved",
        body: "Welcome to the FitCoach beta.",
        link: "/app/dashboard",
        dedupeKey: `account_approved:${workspaceId}`,
      });
      return this.ownerContact(tx, workspace.ownerUserId);
    });
    if (approved.email) {
      this.email.sendInBackground(
        accountApprovedMessage(
          approved.email,
          approved.displayName,
          `${this.config.webOrigin}/login`,
        ),
        { template: "platform.account_approved", userId: approved.userId, workspaceId },
      );
    }
    return this.detail(workspaceId);
  }

  async updatePlan(workspaceId: string, input: PlatformPlanUpdate): Promise<PlatformTrainerDetail> {
    const auth = this.owner();
    await this.systemDb.run("platform: assign plan, client limit, trial end", async (tx) => {
      const workspace = await this.lock(tx, workspaceId);
      const [plan] = await tx
        .select({ id: subscriptionPlans.id })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, input.planId));
      if (!plan) {
        throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Some details need fixing.", {
          planId: ["That plan doesn't exist"],
        });
      }
      const [before] = await tx
        .select()
        .from(workspacePlans)
        .where(eq(workspacePlans.workspaceId, workspaceId));
      // The trial ends at the end of the chosen day in the trainer's time zone.
      const trialEndsAt = input.trialEndsOn
        ? sql`((${input.trialEndsOn}::date + 1)::timestamp at time zone ${workspace.timezone})`
        : null;
      await tx
        .insert(workspacePlans)
        .values({
          workspaceId,
          planId: input.planId,
          maxActiveClients: input.maxActiveClients,
          trialEndsAt,
          assignedByUserId: auth.userId,
        })
        .onConflictDoUpdate({
          target: workspacePlans.workspaceId,
          set: {
            planId: input.planId,
            maxActiveClients: input.maxActiveClients,
            trialEndsAt,
            assignedByUserId: auth.userId,
          },
        });
      await this.audit(
        tx,
        auth,
        workspaceId,
        "workspace.plan_changed",
        null,
        { ...input },
        before
          ? {
              planId: before.planId,
              maxActiveClients: before.maxActiveClients,
              trialEndsAt: before.trialEndsAt?.toISOString() ?? null,
            }
          : null,
      );
    });
    return this.detail(workspaceId);
  }

  /** Read-only workspace, export still allowed (§16.0); the trainer is signed out and told why. */
  async suspend(workspaceId: string, reason: string): Promise<PlatformTrainerDetail> {
    const auth = this.owner();
    await this.systemDb.run("platform: suspend a workspace", async (tx) => {
      const workspace = await this.lock(tx, workspaceId);
      if (workspace.status === "suspended") {
        throw new DomainError(
          ERROR_CODES.CONFLICT_STATE,
          409,
          "This workspace is already suspended.",
        );
      }
      if (workspace.status === "cancelled" || workspace.status === "pending_approval") {
        throw new DomainError(
          ERROR_CODES.CONFLICT_STATE,
          409,
          "Only an active workspace can be suspended.",
        );
      }
      await tx
        .update(workspaces)
        .set({ status: "suspended" })
        .where(eq(workspaces.id, workspaceId));
      // CLAUDE.md rule 9: sessions end on suspension; signing in again shows the read-only banner.
      const revoked = await this.sessions.revokeAllForUser(tx, workspace.ownerUserId, "suspended");
      await this.audit(tx, auth, workspaceId, "workspace.suspended", reason, {
        status: { from: workspace.status, to: "suspended" },
        sessionsRevoked: revoked,
      });
      await notify(tx, {
        workspaceId,
        recipientUserId: workspace.ownerUserId,
        type: "workspace_suspended",
        title: "Your workspace is suspended",
        body: `Reason: ${reason.slice(0, 400)}. It's read-only for now; you can still export your data.`,
        link: "/app/settings/export",
        dedupeKey: `workspace_suspended:${workspaceId}:${Date.now()}`,
      });
    });
    return this.detail(workspaceId);
  }

  async reactivate(workspaceId: string, reason: string): Promise<PlatformTrainerDetail> {
    const auth = this.owner();
    await this.systemDb.run("platform: reactivate a workspace", async (tx) => {
      const workspace = await this.lock(tx, workspaceId);
      if (workspace.status !== "suspended") {
        throw new DomainError(ERROR_CODES.CONFLICT_STATE, 409, "This workspace isn't suspended.");
      }
      await tx.update(workspaces).set({ status: "active" }).where(eq(workspaces.id, workspaceId));
      await this.audit(tx, auth, workspaceId, "workspace.reactivated", reason, {
        status: { from: "suspended", to: "active" },
      });
      await notify(tx, {
        workspaceId,
        recipientUserId: workspace.ownerUserId,
        type: "workspace_reactivated",
        title: "Your workspace is active again",
        body: "Everything works as before.",
        link: "/app/dashboard",
        dedupeKey: `workspace_reactivated:${workspaceId}:${Date.now()}`,
      });
    });
    return this.detail(workspaceId);
  }

  /** Emails the trainer the same reset link as "Forgot password". The owner never sees the link. */
  async sendPasswordReset(workspaceId: string): Promise<void> {
    const auth = this.owner();
    const issued = await this.systemDb.run(
      "platform: send a trainer a password reset",
      async (tx) => {
        const workspace = await this.lock(tx, workspaceId);
        const contact = await this.ownerContact(tx, workspace.ownerUserId);
        if (!contact.email) {
          throw new DomainError(
            ERROR_CODES.CONFLICT_STATE,
            409,
            "This trainer has no email address.",
          );
        }
        const token = await issueAuthToken(
          tx,
          this.config.sessionSecret,
          workspace.ownerUserId,
          "reset_password",
        );
        await this.audit(tx, auth, workspaceId, "user.password_reset_sent", null, null);
        return { ...contact, email: contact.email, token };
      },
    );
    this.email.sendInBackground(
      resetPasswordMessage(
        issued.email,
        `${this.config.webOrigin}/reset-password?token=${encodeURIComponent(issued.token)}`,
      ),
      { template: "auth.reset_password", userId: issued.userId, workspaceId },
    );
  }

  async revokeSessions(workspaceId: string): Promise<PlatformTrainerDetail> {
    const auth = this.owner();
    await this.systemDb.run("platform: revoke a trainer's sessions", async (tx) => {
      const workspace = await this.lock(tx, workspaceId);
      const revoked = await this.sessions.revokeAllForUser(
        tx,
        workspace.ownerUserId,
        "admin_revoked",
      );
      await this.audit(tx, auth, workspaceId, "user.sessions_revoked", null, {
        sessionsRevoked: revoked,
      });
    });
    return this.detail(workspaceId);
  }

  private async lock(tx: Tx, workspaceId: string) {
    const [workspace] = await tx
      .select({
        id: workspaces.id,
        status: workspaces.status,
        ownerUserId: workspaces.ownerUserId,
        timezone: workspaces.timezone,
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for("update");
    if (!workspace) throw trainerNotFound();
    return workspace;
  }

  private async ownerContact(tx: Tx, userId: string) {
    const [row] = (
      await tx.execute<{ email: string | null; display_name: string }>(sql`
        select u.email, p.display_name from users u join profiles p on p.user_id = u.id
        where u.id = ${userId}`)
    ).rows;
    return { userId, email: row?.email ?? null, displayName: row?.display_name ?? "there" };
  }

  private audit(
    tx: Tx,
    auth: AuthContext,
    workspaceId: string,
    action: string,
    reason: string | null,
    after: Record<string, unknown> | null,
    before: Record<string, unknown> | null = null,
  ): Promise<void> {
    return recordAudit(tx, {
      actorKind: "platform_owner",
      actorUserId: auth.userId,
      workspaceId,
      action,
      targetType: "workspace",
      targetId: workspaceId,
      reason: reason ?? undefined,
      before: before ?? undefined,
      after: after ?? undefined,
    });
  }
}

function toTrainer(row: Row): PlatformTrainer {
  return {
    workspaceId: String(row.id),
    businessName: String(row.name),
    slug: String(row.slug),
    ownerName: String(row.display_name),
    ownerEmail: row.email === null ? null : String(row.email),
    status: row.status as WorkspaceStatus,
    city: row.city === null ? null : String(row.city),
    createdAt: iso(row.created_at) ?? "",
    lastActiveAt: iso(row.last_active),
    activeClients: num(row.active_clients),
  };
}
