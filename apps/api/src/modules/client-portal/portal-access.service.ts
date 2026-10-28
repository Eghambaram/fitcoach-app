import { Injectable } from "@nestjs/common";
import {
  CLIENT_INVITE_TTL_DAYS,
  type ClientFeatures,
  clientFeaturesSchema,
  type CreateInviteRequest,
  type CreateInviteResponse,
  ERROR_CODES,
  firstName,
  type InviteChannel,
  type PortalAccess,
  type UpdateClientFeaturesRequest,
} from "@fitcoach/shared";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { generateToken, hashToken } from "../../common/security/tokens";
import { AppConfig } from "../../config/env";
import { DbContext } from "../../db/db-context";
import { trackEvent } from "../product-events/track";
import { clientInvites, clients, sessions } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { EmailService } from "../../integrations/email/email.service";
import { clientInviteMessage } from "../../integrations/email/templates";
import { WhatsAppLinkBuilder } from "../../integrations/whatsapp/whatsapp-link-builder";
import { recordAudit } from "../audit/audit.service";

type Trainer = AuthContext & { workspaceId: string };
type ClientRow = Pick<
  typeof clients.$inferSelect,
  "id" | "status" | "fullName" | "phoneE164" | "email" | "userId" | "portalRevokedAt" | "features"
>;

const DEFAULT_FEATURES: ClientFeatures = {
  workoutSelfLogging: false,
  checkIns: true,
  progressSelfLogging: false,
};

/** The stored flags, with defaults for any missing key. */
export function readFeatures(value: unknown): ClientFeatures {
  const parsed = clientFeaturesSchema.partial().safeParse(value);
  return { ...DEFAULT_FEATURES, ...(parsed.success ? parsed.data : {}) };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const notFound = () => DomainError.notFound("That client doesn't exist.");

/**
 * Portal access for the trainer (PROMPT §8.3, D19): invite links (single use, 7 days, only the HMAC
 * stored; a new link revokes the older open ones), their status and revoking access. Runs as
 * fitcoach_app in the request transaction; the workspace comes from the session only.
 */
@Injectable()
export class PortalAccessService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly config: AppConfig,
    private readonly rateLimit: RateLimitService,
    private readonly whatsApp: WhatsAppLinkBuilder,
    private readonly email: EmailService,
    private readonly systemDb: SystemDb,
  ) {}

  private trainer(): Trainer {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { ...auth, workspaceId: auth.workspaceId };
  }

  private async client(trainer: Trainer, clientId: string, lock = false): Promise<ClientRow> {
    const query = this.db.tx
      .select({
        id: clients.id,
        status: clients.status,
        fullName: clients.fullName,
        phoneE164: clients.phoneE164,
        email: clients.email,
        userId: clients.userId,
        portalRevokedAt: clients.portalRevokedAt,
        features: clients.features,
      })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.workspaceId, trainer.workspaceId)));
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw notFound();
    return row;
  }

  private async access(trainer: Trainer, client: ClientRow): Promise<PortalAccess> {
    const mine = and(
      eq(clientInvites.workspaceId, trainer.workspaceId),
      eq(clientInvites.clientId, client.id),
    );
    const [open] = await this.db.tx
      .select()
      .from(clientInvites)
      .where(
        and(
          mine,
          isNull(clientInvites.consumedAt),
          isNull(clientInvites.revokedAt),
          gt(clientInvites.expiresAt, sql`now()`),
        ),
      )
      .orderBy(desc(clientInvites.createdAt))
      .limit(1);
    const [joined] = await this.db.tx
      .select({ at: sql<Date>`min(${clientInvites.consumedAt})` })
      .from(clientInvites)
      .where(and(mine, isNotNull(clientInvites.consumedAt)));
    const [expired] = await this.db.tx
      .select({ id: clientInvites.id })
      .from(clientInvites)
      .where(and(mine, isNull(clientInvites.consumedAt), isNull(clientInvites.revokedAt)))
      .limit(1);

    const status = client.portalRevokedAt
      ? "revoked"
      : client.userId
        ? "active"
        : open
          ? "invited"
          : expired
            ? "expired"
            : "not_invited";
    const joinedAt = joined?.at ? new Date(joined.at) : null;
    const usable = client.status === "active" || client.status === "paused";
    return {
      status,
      invite: open
        ? {
            channel: open.channel as InviteChannel,
            createdAt: open.createdAt.toISOString(),
            expiresAt: open.expiresAt.toISOString(),
          }
        : null,
      joinedAt: joinedAt?.toISOString() ?? null,
      canWhatsApp: usable && client.phoneE164 !== null,
      canEmail: usable && client.email !== null,
      features: readFeatures(client.features),
    };
  }

  async get(clientId: string): Promise<PortalAccess> {
    const trainer = this.trainer();
    return this.access(trainer, await this.client(trainer, clientId));
  }

  /** Closes every open link of the client. */
  private async revokeOpenInvites(trainer: Trainer, clientId: string): Promise<void> {
    await this.db.tx
      .update(clientInvites)
      .set({ revokedAt: sql`now()` })
      .where(
        and(
          eq(clientInvites.workspaceId, trainer.workspaceId),
          eq(clientInvites.clientId, clientId),
          isNull(clientInvites.consumedAt),
          isNull(clientInvites.revokedAt),
        ),
      );
  }

  /**
   * A new single-use link (older open links stop working), shared by WhatsApp click-to-chat or by
   * email. The raw token exists only in this response; the database keeps its HMAC.
   */
  async invite(clientId: string, input: CreateInviteRequest): Promise<CreateInviteResponse> {
    const trainer = this.trainer();
    await this.rateLimit.consume({
      key: `client-invite:user:${trainer.userId}`,
      windowSeconds: 60 * 60,
      max: 30,
    });
    const client = await this.client(trainer, clientId, true);
    if (client.status !== "active" && client.status !== "paused") {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        client.status === "archived"
          ? "Restore this client before inviting them."
          : "Finish onboarding before inviting this client.",
      );
    }
    if (input.channel === "whatsapp" && !client.phoneE164) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Add a phone number first.", {
        channel: ["This client has no phone number. Send the invite by email instead."],
      });
    }
    if (input.channel === "email" && !client.email) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Add an email address first.", {
        channel: ["This client has no email address."],
      });
    }

    await this.revokeOpenInvites(trainer, client.id);
    const token = generateToken();
    const expiresAt = new Date(Date.now() + CLIENT_INVITE_TTL_DAYS * DAY_MS);
    await this.db.tx.insert(clientInvites).values({
      workspaceId: trainer.workspaceId,
      clientId: client.id,
      tokenHash: hashToken(this.config.sessionSecret, token),
      channel: input.channel,
      expiresAt,
      createdByUserId: trainer.userId,
    });
    if (client.portalRevokedAt) {
      await this.db.tx
        .update(clients)
        .set({ portalRevokedAt: null })
        .where(and(eq(clients.id, client.id), eq(clients.workspaceId, trainer.workspaceId)));
    }
    await recordAudit(this.db.tx, {
      actorKind: "trainer",
      actorUserId: trainer.userId,
      workspaceId: trainer.workspaceId,
      action: "client.portal_invited",
      targetType: "client",
      targetId: client.id,
      after: { channel: input.channel, expiresAt: expiresAt.toISOString() },
    });
    await trackEvent(this.db.tx, {
      event: "client_invited",
      actorKind: "trainer",
      userId: trainer.userId,
      workspaceId: trainer.workspaceId,
      properties: { channel: input.channel },
    });

    const link = `${this.config.webOrigin}/invite/${token}`;
    const context = await this.whatsApp.context(
      trainer.workspaceId,
      trainer.userId,
      "client_invite",
    );
    let emailed = false;
    if (input.channel === "email" && client.email) {
      emailed = await this.email.send(
        clientInviteMessage(client.email, firstName(client.fullName), context.trainerName, link),
        { template: "client.invite", workspaceId: trainer.workspaceId },
      );
    }
    return {
      access: await this.access(trainer, { ...client, portalRevokedAt: null }),
      link,
      expiresAt: expiresAt.toISOString(),
      whatsApp:
        input.channel === "whatsapp" ? this.whatsApp.build(context, client, { link }) : null,
      emailed,
    };
  }

  /** Per-client features (§8.3), e.g. letting the client log their own workouts. */
  async setFeatures(clientId: string, input: UpdateClientFeaturesRequest): Promise<PortalAccess> {
    const trainer = this.trainer();
    const client = await this.client(trainer, clientId, true);
    const features = { ...readFeatures(client.features), ...input };
    await this.db.tx
      .update(clients)
      .set({ features })
      .where(and(eq(clients.id, client.id), eq(clients.workspaceId, trainer.workspaceId)));
    await recordAudit(this.db.tx, {
      actorKind: "trainer",
      actorUserId: trainer.userId,
      workspaceId: trainer.workspaceId,
      action: "client.features_changed",
      targetType: "client",
      targetId: client.id,
      before: readFeatures(client.features),
      after: features,
    });
    return this.access(trainer, { ...client, features });
  }

  /** Turns portal access off: open links stop working and the client is signed out everywhere. */
  async revoke(clientId: string): Promise<PortalAccess> {
    const trainer = this.trainer();
    const client = await this.client(trainer, clientId, true);
    await this.revokeOpenInvites(trainer, client.id);
    await this.db.tx
      .update(clients)
      .set({ portalRevokedAt: sql`now()` })
      .where(and(eq(clients.id, client.id), eq(clients.workspaceId, trainer.workspaceId)));
    if (client.userId) {
      const workspaceId = trainer.workspaceId;
      // Sessions belong to the client's user, which the trainer can't see under RLS.
      await this.systemDb.run("client portal: revoke a client's sessions on access revoke", (tx) =>
        tx
          .update(sessions)
          .set({ revokedAt: sql`now()`, revokedReason: "admin_revoked" })
          .where(
            and(
              eq(sessions.workspaceId, workspaceId),
              eq(sessions.clientId, client.id),
              isNull(sessions.revokedAt),
            ),
          ),
      );
    }
    await recordAudit(this.db.tx, {
      actorKind: "trainer",
      actorUserId: trainer.userId,
      workspaceId: trainer.workspaceId,
      action: "client.portal_revoked",
      targetType: "client",
      targetId: client.id,
    });
    return this.access(trainer, { ...client, portalRevokedAt: new Date() });
  }
}
