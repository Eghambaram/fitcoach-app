import { Injectable } from "@nestjs/common";
import {
  ERROR_CODES,
  type LoginRequest,
  type MeResponse,
  type ResetPasswordRequest,
  type SessionsResponse,
  type SignupRequest,
  type WorkspaceStatus,
} from "@fitcoach/shared";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "../../common/security/passwords";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { hashToken } from "../../common/security/tokens";
import { AppConfig } from "../../config/env";
import { DbContext } from "../../db/db-context";
import { files, profiles, sessions, users, workspaceMembers, workspaces } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { EmailService } from "../../integrations/email/email.service";
import {
  accountExistsMessage,
  resetPasswordMessage,
  verifyEmailMessage,
} from "../../integrations/email/templates";
import { recordAudit } from "../audit/audit.service";
import { FilesService } from "../files/files.service";
import { consumeBetaInvite } from "../platform/beta-invites";
import { trackEvent } from "../product-events/track";
import { consumeAuthToken, issueAuthToken } from "./auth-tokens";
import { type NewSession, SessionsService } from "./sessions.service";
import { createTrainerAccount } from "./trainer-accounts";

export interface RequestMeta {
  ipHash?: string;
  userAgent?: string;
  requestId?: string;
}

const MINUTE = 60;

/** Thrown inside the signup transaction to roll back the invite use when the email already has an account. */
class ExistingAccount extends Error {
  constructor(readonly userId: string) {
    super("existing account");
  }
}

const invalidLink = () =>
  new DomainError(
    ERROR_CODES.TOKEN_INVALID,
    400,
    "This link is invalid or has expired. Request a new one.",
  );

const invalidCredentials = () =>
  new DomainError(ERROR_CODES.INVALID_CREDENTIALS, 401, "That email and password don't match.");

/**
 * Trainer authentication (PROMPT §12.2). Pre-session steps (signup, login, token links) run through
 * SystemDb; signed-in reads (me, sessions) run in the request transaction under RLS.
 * Responses never reveal whether an email has an account.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly systemDb: SystemDb,
    private readonly db: DbContext,
    private readonly sessions: SessionsService,
    private readonly rateLimit: RateLimitService,
    private readonly email: EmailService,
    private readonly cls: ClsService<AppClsStore>,
    private readonly files: FilesService,
  ) {}

  private emailKey(email: string): string {
    return hashToken(this.config.sessionSecret, `email:${email}`).slice(0, 32);
  }

  private link(path: string, token: string): string {
    return `${this.config.webOrigin}${path}?token=${encodeURIComponent(token)}`;
  }

  // -------------------------------------------------------------------------------------------
  // Signup & email verification
  // -------------------------------------------------------------------------------------------

  async signup(input: SignupRequest, meta: RequestMeta): Promise<void> {
    await this.rateLimit.consume({
      key: `signup:ip:${meta.ipHash ?? "unknown"}`,
      windowSeconds: 60 * MINUTE,
      max: 10,
    });

    if (this.config.signupMode === "invite_code" && !input.inviteCode) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Enter your beta invite code.", {
        inviteCode: ["FitCoach is in a closed beta. Enter the invite code you were given."],
      });
    }

    // Hash before touching the database: both outcomes below cost the same argon2 work.
    const passwordHash = await hashPassword(input.account.password);

    let created: { userId: string; workspaceId: string; token: string } | undefined;
    try {
      created = await this.systemDb.run("auth: trainer signup", async (tx) => {
        // Order matters for non-enumeration: the invite code and the page address are checked before
        // the email, so their errors never depend on whether the email is registered.
        if (this.config.signupMode === "invite_code") {
          const inviteId = await consumeBetaInvite(
            tx,
            this.config.sessionSecret,
            input.inviteCode ?? "",
          );
          if (!inviteId) {
            throw new DomainError(
              ERROR_CODES.VALIDATION_FAILED,
              400,
              "That invite code isn't valid.",
              {
                inviteCode: [
                  "This code isn't valid or has been used up. Check it, or ask for a new one.",
                ],
              },
            );
          }
        }

        const slugTaken = await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.slug, input.business.slug));
        if (slugTaken.length > 0) {
          throw new DomainError(
            ERROR_CODES.CONFLICT_DUPLICATE,
            409,
            "That page address is taken.",
            {
              "business.slug": ["This address is already taken. Try another one."],
            },
          );
        }

        const [existing] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.account.email));
        if (existing) throw new ExistingAccount(existing.id);

        const account = await createTrainerAccount(tx, input, {
          passwordHash,
          clientLimit: this.config.betaDefaultClientLimit,
          workspaceStatus: this.config.signupMode === "approval" ? "pending_approval" : "active",
        });
        const token = await issueAuthToken(
          tx,
          this.config.sessionSecret,
          account.userId,
          "verify_email",
        );
        await recordAudit(tx, {
          actorKind: "trainer",
          actorUserId: account.userId,
          workspaceId: account.workspaceId,
          action: "trainer.signed_up",
          targetType: "workspace",
          targetId: account.workspaceId,
          ipHash: meta.ipHash,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        });
        return { ...account, token };
      });
    } catch (error) {
      if (!(error instanceof ExistingAccount)) throw error;
      // Same response as a new signup; the owner of the address learns someone tried.
      this.email.sendInBackground(
        accountExistsMessage(
          input.account.email,
          `${this.config.webOrigin}/login`,
          `${this.config.webOrigin}/forgot-password`,
        ),
        { template: "auth.account_exists", userId: error.userId },
      );
      return;
    }

    this.email.sendInBackground(
      verifyEmailMessage(
        input.account.email,
        input.profile.displayName,
        this.link("/verify-email", created.token),
      ),
      { template: "auth.verify_email", userId: created.userId, workspaceId: created.workspaceId },
    );
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<void> {
    await this.rateLimit.consume({
      key: `verify:ip:${meta.ipHash ?? "unknown"}`,
      windowSeconds: 15 * MINUTE,
      max: 30,
    });

    await this.systemDb.run("auth: verify email link", async (tx) => {
      const userId = await consumeAuthToken(tx, this.config.sessionSecret, "verify_email", token);
      if (!userId) throw invalidLink();

      const verified = await tx
        .update(users)
        .set({ emailVerifiedAt: sql`now()` })
        .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)))
        .returning({ id: users.id });
      if (verified.length === 0) return;

      const [membership] = await tx
        .select({ workspaceId: workspaceMembers.workspaceId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.userId, userId));
      await trackEvent(tx, {
        event: "email_verified",
        actorKind: "trainer",
        userId,
        workspaceId: membership?.workspaceId ?? null,
      });
    });
  }

  async resendVerification(email: string, meta: RequestMeta): Promise<void> {
    await this.rateLimit.consume(
      { key: `resend:ip:${meta.ipHash ?? "unknown"}`, windowSeconds: 60 * MINUTE, max: 10 },
      { key: `resend:email:${this.emailKey(email)}`, windowSeconds: 60 * MINUTE, max: 3 },
    );
    await this.sendVerificationIfUnverified(email);
  }

  private async sendVerificationIfUnverified(email: string): Promise<void> {
    const pending = await this.systemDb.run("auth: issue verification link", async (tx) => {
      const [user] = await tx
        .select({ id: users.id, displayName: profiles.displayName })
        .from(users)
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(
          and(eq(users.email, email), isNull(users.emailVerifiedAt), eq(profiles.kind, "trainer")),
        );
      if (!user) return null;
      return {
        ...user,
        token: await issueAuthToken(tx, this.config.sessionSecret, user.id, "verify_email"),
      };
    });
    if (pending) {
      this.email.sendInBackground(
        verifyEmailMessage(email, pending.displayName, this.link("/verify-email", pending.token)),
        {
          template: "auth.verify_email",
          userId: pending.id,
        },
      );
    }
  }

  // -------------------------------------------------------------------------------------------
  // Login / logout
  // -------------------------------------------------------------------------------------------

  async login(input: LoginRequest, meta: RequestMeta): Promise<NewSession> {
    await this.rateLimit.consume(
      { key: `login:ip:${meta.ipHash ?? "unknown"}`, windowSeconds: 15 * MINUTE, max: 20 },
      { key: `login:email:${this.emailKey(input.email)}`, windowSeconds: 15 * MINUTE, max: 10 },
    );

    const account = await this.systemDb.run("auth: look up account for login", async (tx) => {
      const [row] = await tx
        .select({
          id: users.id,
          passwordHash: users.passwordHash,
          status: users.status,
          emailVerifiedAt: users.emailVerifiedAt,
          kind: profiles.kind,
          workspaceId: workspaceMembers.workspaceId,
        })
        .from(users)
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .leftJoin(workspaceMembers, eq(workspaceMembers.userId, users.id))
        .where(eq(users.email, input.email));
      return row;
    });

    if (!account?.passwordHash) {
      await verifyAgainstDummy(input.password);
      throw invalidCredentials();
    }
    const passwordOk = await verifyPassword(account.passwordHash, input.password);
    // Disabled accounts and non-trainers (clients use links/OTP in 4.1) look exactly like a wrong password.
    if (
      !passwordOk ||
      account.status !== "active" ||
      account.kind !== "trainer" ||
      !account.workspaceId
    ) {
      throw invalidCredentials();
    }
    if (!account.emailVerifiedAt) {
      await this.sendVerificationIfUnverified(input.email);
      throw new DomainError(
        ERROR_CODES.EMAIL_NOT_VERIFIED,
        403,
        "Confirm your email address first. We've sent you a new link.",
      );
    }

    const { workspaceId } = account;
    return this.systemDb.run("auth: create session after login", async (tx) => {
      const session = await this.sessions.create(tx, {
        userId: account.id,
        actor: "trainer",
        workspaceId,
        ipHash: meta.ipHash,
        userAgent: meta.userAgent,
      });
      await recordAudit(tx, {
        actorKind: "trainer",
        actorUserId: account.id,
        workspaceId,
        action: "session.created",
        targetType: "session",
        targetId: session.id,
        ipHash: meta.ipHash,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      });
      return session;
    });
  }

  /** Revokes the current session, if any. Logout always "succeeds" so the cookie gets cleared. */
  async logout(): Promise<void> {
    const auth = this.cls.get("auth");
    if (!auth) return;
    await this.db.tx
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: "logout" })
      .where(and(eq(sessions.id, auth.sessionId), isNull(sessions.revokedAt)));
  }

  // -------------------------------------------------------------------------------------------
  // Password reset
  // -------------------------------------------------------------------------------------------

  async forgotPassword(email: string, meta: RequestMeta): Promise<void> {
    await this.rateLimit.consume(
      { key: `forgot:ip:${meta.ipHash ?? "unknown"}`, windowSeconds: 60 * MINUTE, max: 10 },
      { key: `forgot:email:${this.emailKey(email)}`, windowSeconds: 60 * MINUTE, max: 3 },
    );
    const issued = await this.systemDb.run("auth: issue password reset link", async (tx) => {
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), eq(users.status, "active")));
      if (!user) return null;
      return {
        userId: user.id,
        token: await issueAuthToken(tx, this.config.sessionSecret, user.id, "reset_password"),
      };
    });
    if (issued) {
      this.email.sendInBackground(
        resetPasswordMessage(email, this.link("/reset-password", issued.token)),
        {
          template: "auth.reset_password",
          userId: issued.userId,
        },
      );
    }
  }

  async resetPassword(input: ResetPasswordRequest, meta: RequestMeta): Promise<void> {
    await this.rateLimit.consume({
      key: `reset:ip:${meta.ipHash ?? "unknown"}`,
      windowSeconds: 15 * MINUTE,
      max: 20,
    });
    const passwordHash = await hashPassword(input.password);

    await this.systemDb.run("auth: reset password from link", async (tx) => {
      const userId = await consumeAuthToken(
        tx,
        this.config.sessionSecret,
        "reset_password",
        input.token,
      );
      if (!userId) throw invalidLink();

      // Following the emailed link also proves the address, so it counts as verification.
      await tx
        .update(users)
        .set({ passwordHash, emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
        .where(eq(users.id, userId));
      const revoked = await this.sessions.revokeAllForUser(tx, userId, "password_reset");
      await recordAudit(tx, {
        actorKind: "system",
        actorUserId: userId,
        workspaceId: null,
        action: "user.password_reset",
        targetType: "user",
        targetId: userId,
        after: { sessionsRevoked: revoked },
        ipHash: meta.ipHash,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      });
    });
  }

  // -------------------------------------------------------------------------------------------
  // Signed in (request transaction, RLS)
  // -------------------------------------------------------------------------------------------

  private requireAuth(): AuthContext {
    const auth = this.cls.get("auth");
    if (!auth)
      throw new DomainError(ERROR_CODES.UNAUTHENTICATED, 401, "Please sign in to continue.");
    return auth;
  }

  async me(): Promise<MeResponse> {
    const auth = this.requireAuth();
    const [row] = await this.db.tx
      .select({
        id: users.id,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        displayName: profiles.displayName,
        avatarKey: files.objectKey,
      })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      // RLS: only the caller's own workspace files are visible.
      .leftJoin(files, eq(files.id, profiles.avatarFileId))
      .where(eq(users.id, auth.userId));
    if (!row)
      throw new DomainError(ERROR_CODES.UNAUTHENTICATED, 401, "Please sign in to continue.");

    const workspace = auth.workspaceId
      ? (
          await this.db.tx
            .select({
              id: workspaces.id,
              name: workspaces.name,
              slug: workspaces.slug,
              status: workspaces.status,
              timezone: workspaces.timezone,
            })
            .from(workspaces)
            .where(eq(workspaces.id, auth.workspaceId))
        )[0]
      : undefined;

    return {
      user: { id: row.id, email: row.email, emailVerified: row.emailVerifiedAt !== null },
      actor: auth.actor,
      profile: { displayName: row.displayName, avatarUrl: this.files.avatarUrl(row.avatarKey) },
      workspace: workspace ? { ...workspace, status: workspace.status as WorkspaceStatus } : null,
    };
  }

  async listSessions(): Promise<SessionsResponse> {
    const auth = this.requireAuth();
    const rows = await this.db.tx
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, auth.userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, sql`now()`),
        ),
      )
      .orderBy(desc(sessions.lastSeenAt));

    return {
      sessions: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        userAgent: row.userAgent,
        current: row.id === auth.sessionId,
      })),
    };
  }

  /** Revokes one of the caller's own sessions. Returns whether it was the current one. */
  async revokeSession(id: string): Promise<{ current: boolean }> {
    const auth = this.requireAuth();
    // RLS limits this to the caller's own sessions; another user's id simply matches nothing → 404.
    const revoked = await this.db.tx
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: "user_revoked" })
      .where(and(eq(sessions.id, id), eq(sessions.userId, auth.userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (revoked.length === 0)
      throw DomainError.notFound("That session doesn't exist or has already ended.");
    return { current: id === auth.sessionId };
  }
}
