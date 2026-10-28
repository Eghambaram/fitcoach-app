import { randomInt, randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import {
  type AcceptInviteRequest,
  CLIENT_OTP_LENGTH,
  CLIENT_OTP_MAX_ATTEMPTS,
  CLIENT_OTP_TTL_MINUTES,
  CLIENT_TERMS_VERSION,
  ERROR_CODES,
  type InvitePreviewResponse,
  type VerifyCodeRequest,
} from "@fitcoach/shared";
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { DomainError } from "../../common/errors/domain-error";
import { RateLimitService } from "../../common/security/rate-limit.service";
import type { RequestMeta } from "../../common/security/request-meta";
import { hashToken, safeEqual } from "../../common/security/tokens";
import { AppConfig } from "../../config/env";
import type { Tx } from "../../db/database";
import {
  authTokens,
  clientInvites,
  clients,
  files,
  profiles,
  sessions,
  users,
  workspaceMembers,
  workspaces,
} from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { EmailService } from "../../integrations/email/email.service";
import { clientCodeMessage } from "../../integrations/email/templates";
import { recordAudit } from "../audit/audit.service";
import { type NewSession, SessionsService } from "../auth/sessions.service";
import { FilesService } from "../files/files.service";
import { notify } from "../notifications/notify";

const MINUTE = 60;
const PORTAL_STATUSES = ["active", "paused"];

const invalidLink = () =>
  new DomainError(
    ERROR_CODES.TOKEN_INVALID,
    400,
    "This link has expired or was already used. Ask your trainer for a new one, or sign in with a code.",
  );
const invalidCode = () =>
  new DomainError(ERROR_CODES.TOKEN_INVALID, 400, "That code is wrong or has expired.", {
    code: ["That code is wrong or has expired. Request a new one."],
  });

/** A sign-in code for this token row (the row id keeps equal codes from colliding). */
const codeHash = (secret: string, tokenId: string, code: string) =>
  hashToken(secret, `client-otp:${tokenId}:${code}`);

/**
 * Client sign-in (PROMPT D19, §12.2): the invite link and the 6-digit email code. Both are
 * pre-session, so they run through SystemDb, are rate-limited per IP (and per email for codes), and
 * never reveal whether an email or client exists. The invite preview shows only who invited them.
 */
@Injectable()
export class ClientAuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly systemDb: SystemDb,
    private readonly sessions: SessionsService,
    private readonly rateLimit: RateLimitService,
    private readonly email: EmailService,
    private readonly files: FilesService,
  ) {}

  private emailKey(email: string): string {
    return hashToken(this.config.sessionSecret, `email:${email}`).slice(0, 32);
  }

  /** The open invite behind a token, with its client still able to use the portal. */
  private async openInvite(tx: Tx, token: string, lock: boolean) {
    const query = tx
      .select({
        id: clientInvites.id,
        workspaceId: clientInvites.workspaceId,
        clientId: clientInvites.clientId,
      })
      .from(clientInvites)
      .innerJoin(
        clients,
        and(
          eq(clients.workspaceId, clientInvites.workspaceId),
          eq(clients.id, clientInvites.clientId),
        ),
      )
      .innerJoin(workspaces, eq(workspaces.id, clientInvites.workspaceId))
      .where(
        and(
          eq(clientInvites.tokenHash, hashToken(this.config.sessionSecret, token)),
          isNull(clientInvites.consumedAt),
          isNull(clientInvites.revokedAt),
          gt(clientInvites.expiresAt, sql`now()`),
          inArray(clients.status, PORTAL_STATUSES),
          isNull(clients.portalRevokedAt),
          sql`${workspaces.status} <> 'cancelled'`,
        ),
      );
    const [row] = lock ? await query.for("update", { of: clientInvites }) : await query;
    return row;
  }

  async previewInvite(token: string, meta: RequestMeta): Promise<InvitePreviewResponse> {
    await this.rateLimit.consume({
      key: `client-invite:ip:${meta.ipHash ?? "unknown"}`,
      windowSeconds: 15 * MINUTE,
      max: 30,
    });
    const preview = await this.systemDb.run("client auth: preview an invite link", async (tx) => {
      const invite = await this.openInvite(tx, token, false);
      if (!invite) return null;
      const [trainer] = await tx
        .select({
          businessName: workspaces.name,
          trainerName: profiles.displayName,
          avatarKey: files.objectKey,
        })
        .from(workspaces)
        .innerJoin(
          workspaceMembers,
          and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.role, "owner")),
        )
        .innerJoin(profiles, eq(profiles.userId, workspaceMembers.userId))
        .leftJoin(files, eq(files.id, profiles.avatarFileId))
        .where(eq(workspaces.id, invite.workspaceId));
      return trainer ?? null;
    });
    if (!preview) throw invalidLink();
    return {
      trainerName: preview.trainerName,
      businessName: preview.businessName,
      trainerAvatarUrl: this.files.avatarUrl(preview.avatarKey),
    };
  }

  /**
   * Uses the link once (row-locked): links or creates the client's login, records the accepted
   * terms and starts a 60-day client session.
   */
  async acceptInvite(input: AcceptInviteRequest, meta: RequestMeta): Promise<NewSession> {
    await this.rateLimit.consume({
      key: `client-invite:ip:${meta.ipHash ?? "unknown"}`,
      windowSeconds: 15 * MINUTE,
      max: 30,
    });
    const session = await this.systemDb.run("client auth: accept an invite link", async (tx) => {
      const invite = await this.openInvite(tx, input.token, true);
      if (!invite) return null;
      const [client] = await tx
        .select()
        .from(clients)
        .where(and(eq(clients.id, invite.clientId), eq(clients.workspaceId, invite.workspaceId)))
        .for("update");
      if (!client) return null;

      const userId = client.userId ?? (await this.clientUser(tx, client));
      if (!client.userId) {
        await tx
          .update(clients)
          .set({ userId })
          .where(and(eq(clients.id, client.id), eq(clients.workspaceId, client.workspaceId)));
      }
      await tx
        .update(clientInvites)
        .set({ consumedAt: sql`now()` })
        .where(eq(clientInvites.id, invite.id));
      // Any other open link for this client is now pointless.
      await tx
        .update(clientInvites)
        .set({ revokedAt: sql`now()` })
        .where(
          and(
            eq(clientInvites.workspaceId, client.workspaceId),
            eq(clientInvites.clientId, client.id),
            isNull(clientInvites.consumedAt),
            isNull(clientInvites.revokedAt),
          ),
        );
      const [workspace] = await tx
        .select({ ownerUserId: workspaces.ownerUserId })
        .from(workspaces)
        .where(eq(workspaces.id, client.workspaceId));
      if (workspace) {
        await notify(tx, {
          workspaceId: client.workspaceId,
          recipientUserId: workspace.ownerUserId,
          type: "invite_accepted",
          title: `${client.fullName} joined the client app`,
          link: `/app/clients/${client.id}`,
          data: { clientId: client.id },
          dedupeKey: `invite_accepted:${invite.id}`,
        });
      }
      await recordAudit(tx, {
        actorKind: "client",
        actorUserId: userId,
        workspaceId: client.workspaceId,
        action: "client.portal_joined",
        targetType: "client",
        targetId: client.id,
        after: { termsVersion: CLIENT_TERMS_VERSION },
        ipHash: meta.ipHash,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      });
      return this.sessions.create(tx, {
        userId,
        actor: "client",
        workspaceId: client.workspaceId,
        clientId: client.id,
        ipHash: meta.ipHash,
        userAgent: meta.userAgent,
      });
    });
    if (!session) throw invalidLink();
    return session;
  }

  /**
   * The client's login: an existing client login with the same email, else a new user. An email
   * that already belongs to a trainer account isn't reused (one login can't be both), so that
   * client signs in by invite link only (ADR-0055).
   */
  private async clientUser(tx: Tx, client: typeof clients.$inferSelect): Promise<string> {
    if (client.email) {
      const [existing] = await tx
        .select({ id: users.id, kind: profiles.kind, status: users.status })
        .from(users)
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(eq(users.email, client.email));
      if (existing?.kind === "client" && existing.status === "active") return existing.id;
    }
    const emailFree =
      client.email !== null &&
      (await tx.select({ id: users.id }).from(users).where(eq(users.email, client.email)))
        .length === 0;
    const [user] = await tx
      .insert(users)
      .values({ email: emailFree ? client.email : null })
      .returning({ id: users.id });
    if (!user) throw new Error("user insert returned no row");
    await tx.insert(profiles).values({
      userId: user.id,
      kind: "client",
      displayName: client.fullName,
      phoneE164: client.phoneE164,
    });
    return user.id;
  }

  /** The client a login signs in as: the one it used most recently (one per login in practice). */
  private async portalClient(tx: Tx, userId: string) {
    const [client] = await tx
      .select({ id: clients.id, workspaceId: clients.workspaceId })
      .from(clients)
      .innerJoin(workspaces, eq(workspaces.id, clients.workspaceId))
      .where(
        and(
          eq(clients.userId, userId),
          inArray(clients.status, PORTAL_STATUSES),
          isNull(clients.portalRevokedAt),
          sql`${workspaces.status} <> 'cancelled'`,
        ),
      )
      .orderBy(
        sql`(select max(${sessions.createdAt}) from ${sessions} where ${sessions.clientId} = ${clients.id}) desc nulls last`,
        desc(clients.updatedAt),
      )
      .limit(1);
    return client;
  }

  /** Always accepted: a code is emailed only when the email belongs to a client with access. */
  async requestCode(email: string, meta: RequestMeta): Promise<void> {
    await this.rateLimit.consume(
      { key: `client-code:ip:${meta.ipHash ?? "unknown"}`, windowSeconds: 15 * MINUTE, max: 10 },
      { key: `client-code:email:${this.emailKey(email)}`, windowSeconds: 15 * MINUTE, max: 5 },
    );
    const code = String(randomInt(0, 10 ** CLIENT_OTP_LENGTH)).padStart(CLIENT_OTP_LENGTH, "0");
    const issued = await this.systemDb.run(
      "client auth: issue an email sign-in code",
      async (tx) => {
        const [user] = await tx
          .select({ id: users.id })
          .from(users)
          .innerJoin(profiles, eq(profiles.userId, users.id))
          .where(
            and(eq(users.email, email), eq(users.status, "active"), eq(profiles.kind, "client")),
          );
        if (!user || !(await this.portalClient(tx, user.id))) return null;
        await tx
          .update(authTokens)
          .set({ consumedAt: sql`now()` })
          .where(
            and(
              eq(authTokens.userId, user.id),
              eq(authTokens.purpose, "email_otp"),
              isNull(authTokens.consumedAt),
            ),
          );
        const id = randomUUID();
        await tx.insert(authTokens).values({
          id,
          userId: user.id,
          purpose: "email_otp",
          tokenHash: codeHash(this.config.sessionSecret, id, code),
          expiresAt: new Date(Date.now() + CLIENT_OTP_TTL_MINUTES * 60_000),
        });
        return user.id;
      },
    );
    if (issued) {
      this.email.sendInBackground(clientCodeMessage(email, code), {
        template: "client.sign_in_code",
        userId: issued,
      });
    }
  }

  /**
   * Checks the latest code (5 attempts, 10 minutes, single use). Wrong attempts are counted in a
   * committed transaction, then the error is thrown.
   */
  async verifyCode(input: VerifyCodeRequest, meta: RequestMeta): Promise<NewSession> {
    await this.rateLimit.consume(
      {
        key: `client-code-verify:ip:${meta.ipHash ?? "unknown"}`,
        windowSeconds: 15 * MINUTE,
        max: 20,
      },
      {
        key: `client-code-verify:email:${this.emailKey(input.email)}`,
        windowSeconds: 15 * MINUTE,
        max: 10,
      },
    );
    const result = await this.systemDb.run(
      "client auth: verify an email sign-in code",
      async (tx) => {
        const [token] = await tx
          .select({
            id: authTokens.id,
            userId: authTokens.userId,
            attempts: authTokens.attempts,
            tokenHash: authTokens.tokenHash,
          })
          .from(authTokens)
          .innerJoin(users, eq(users.id, authTokens.userId))
          .where(
            and(
              eq(users.email, input.email),
              eq(users.status, "active"),
              eq(authTokens.purpose, "email_otp"),
              isNull(authTokens.consumedAt),
              gt(authTokens.expiresAt, sql`now()`),
            ),
          )
          .orderBy(desc(authTokens.createdAt))
          .limit(1)
          .for("update", { of: authTokens });
        if (!token) return null;
        const attempts = token.attempts + 1;
        const matches = safeEqual(
          token.tokenHash,
          codeHash(this.config.sessionSecret, token.id, input.code),
        );
        const spent = matches || attempts >= CLIENT_OTP_MAX_ATTEMPTS;
        await tx
          .update(authTokens)
          .set({ attempts, consumedAt: spent ? sql`now()` : null })
          .where(eq(authTokens.id, token.id));
        if (!matches) return null;
        const client = await this.portalClient(tx, token.userId);
        if (!client) return null;
        await tx
          .update(users)
          .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())` })
          .where(eq(users.id, token.userId));
        await recordAudit(tx, {
          actorKind: "client",
          actorUserId: token.userId,
          workspaceId: client.workspaceId,
          action: "client.signed_in",
          targetType: "client",
          targetId: client.id,
          ipHash: meta.ipHash,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        });
        return this.sessions.create(tx, {
          userId: token.userId,
          actor: "client",
          workspaceId: client.workspaceId,
          clientId: client.id,
          ipHash: meta.ipHash,
          userAgent: meta.userAgent,
        });
      },
    );
    if (!result) throw invalidCode();
    return result;
  }
}
