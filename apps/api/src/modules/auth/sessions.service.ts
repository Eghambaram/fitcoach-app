import { Injectable } from "@nestjs/common";
import type { WorkspaceStatus } from "@fitcoach/shared";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Actor } from "../../common/request-context";
import { generateToken, hashToken } from "../../common/security/tokens";
import { AppConfig } from "../../config/env";
import type { Tx } from "../../db/database";
import { clients, platformRoles, sessions, users, workspaces } from "../../db/schema";
import { SystemDb } from "../../db/system-db";

const DAY_MS = 24 * 60 * 60 * 1000;

/** PROMPT §12.2: trainers 30-day sliding, clients 60-day sliding, platform owners 12 h absolute. */
export const SESSION_TTL_MS: Record<Actor, number> = {
  trainer: 30 * DAY_MS,
  client: 60 * DAY_MS,
  platform_owner: 12 * 60 * 60 * 1000,
};

/** Sliding sessions are extended at most this often, to avoid a write on every request. */
const SLIDE_INTERVAL_MS = 15 * 60 * 1000;

export type RevokeReason =
  | "logout"
  | "user_revoked"
  | "password_reset"
  | "password_changed"
  | "archived"
  | "suspended"
  | "admin_revoked";

export interface NewSession {
  token: string;
  id: string;
  expiresAt: Date;
}

export interface ResolvedSession {
  id: string;
  userId: string;
  actor: Actor;
  workspaceId: string | null;
  /** Set for client sessions only: the client they act as. */
  clientId: string | null;
  workspaceStatus: WorkspaceStatus | null;
  aal: 1 | 2;
  expiresAt: Date;
}

@Injectable()
export class SessionsService {
  constructor(
    private readonly config: AppConfig,
    private readonly systemDb: SystemDb,
  ) {}

  /** Creates a fresh session (a new token on every login — rotation). Call inside a SystemDb transaction. */
  async create(
    tx: Tx,
    input: {
      userId: string;
      actor: Actor;
      workspaceId: string | null;
      /** Required for client sessions (one client of one workspace). */
      clientId?: string | null;
      ipHash?: string;
      userAgent?: string;
    },
  ): Promise<NewSession> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS[input.actor]);
    const [row] = await tx
      .insert(sessions)
      .values({
        tokenHash: hashToken(this.config.sessionSecret, token),
        userId: input.userId,
        actor: input.actor,
        workspaceId: input.workspaceId,
        clientId: input.clientId ?? null,
        expiresAt,
        ipHash: input.ipHash,
        userAgent: input.userAgent?.slice(0, 300),
      })
      .returning({ id: sessions.id });
    if (!row) throw new Error("session insert returned no row");
    return { token, id: row.id, expiresAt };
  }

  /**
   * Looks up the session for a cookie value. Pre-session by definition, so it uses SystemDb.
   * Revoked, expired and disabled-user sessions resolve to null, and so do client sessions whose
   * client was archived, had portal access revoked or whose workspace was cancelled.
   */
  async resolve(token: string): Promise<ResolvedSession | null> {
    const tokenHash = hashToken(this.config.sessionSecret, token);
    return this.systemDb.run("auth: resolve session from cookie", async (tx) => {
      const [row] = await tx
        .select({
          id: sessions.id,
          userId: sessions.userId,
          actor: sessions.actor,
          workspaceId: sessions.workspaceId,
          clientId: sessions.clientId,
          clientStatus: clients.status,
          portalRevokedAt: clients.portalRevokedAt,
          workspaceStatus: workspaces.status,
          expiresAt: sessions.expiresAt,
          lastSeenAt: sessions.lastSeenAt,
          aal: sessions.aal,
          // A platform session ends the moment its role is revoked.
          platformRole: platformRoles.role,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .leftJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
        .leftJoin(
          clients,
          and(eq(clients.workspaceId, sessions.workspaceId), eq(clients.id, sessions.clientId)),
        )
        .leftJoin(
          platformRoles,
          and(
            eq(platformRoles.userId, sessions.userId),
            eq(platformRoles.role, "platform_owner"),
            isNull(platformRoles.revokedAt),
          ),
        )
        .where(
          and(
            eq(sessions.tokenHash, tokenHash),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, sql`now()`),
            eq(users.status, "active"),
          ),
        );
      if (!row) return null;

      const actor = row.actor as Actor;
      if (
        actor === "client" &&
        (!row.clientStatus ||
          !["active", "paused"].includes(row.clientStatus) ||
          row.portalRevokedAt !== null ||
          row.workspaceStatus === "cancelled")
      ) {
        return null;
      }
      if (actor === "platform_owner" && row.platformRole === null) return null;
      let expiresAt = row.expiresAt;
      const sliding = actor !== "platform_owner";
      if (sliding && Date.now() - row.lastSeenAt.getTime() > SLIDE_INTERVAL_MS) {
        expiresAt = new Date(Date.now() + SESSION_TTL_MS[actor]);
        await tx
          .update(sessions)
          .set({ lastSeenAt: sql`now()`, expiresAt })
          .where(eq(sessions.id, row.id));
      }

      return {
        id: row.id,
        userId: row.userId,
        actor,
        workspaceId: row.workspaceId,
        clientId: row.clientId,
        workspaceStatus: (row.workspaceStatus as WorkspaceStatus | null) ?? null,
        aal: row.aal === 2 ? 2 : 1,
        expiresAt,
      };
    });
  }

  /**
   * Raises a platform owner session to AAL2 after its TOTP or recovery code (§12.2). The absolute
   * 12-hour expiry is unchanged. Call inside a SystemDb transaction.
   */
  async elevate(tx: Tx, sessionId: string): Promise<void> {
    await tx
      .update(sessions)
      .set({ aal: 2 })
      .where(and(eq(sessions.id, sessionId), eq(sessions.actor, "platform_owner")));
  }

  /** Revokes every live session of a user — password reset/change, archive, suspension (CLAUDE.md rule 9). */
  async revokeAllForUser(tx: Tx, userId: string, reason: RevokeReason): Promise<number> {
    const revoked = await tx
      .update(sessions)
      .set({ revokedAt: sql`now()`, revokedReason: reason })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return revoked.length;
  }
}
