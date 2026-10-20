import { Injectable } from "@nestjs/common";
import type { WorkspaceStatus } from "@fitcoach/shared";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Actor } from "../../common/request-context";
import { generateToken, hashToken } from "../../common/security/tokens";
import { AppConfig } from "../../config/env";
import type { Tx } from "../../db/database";
import { sessions, users, workspaces } from "../../db/schema";
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
  workspaceStatus: WorkspaceStatus | null;
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
   * Revoked, expired and disabled-user sessions resolve to null.
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
          workspaceStatus: workspaces.status,
          expiresAt: sessions.expiresAt,
          lastSeenAt: sessions.lastSeenAt,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .leftJoin(workspaces, eq(workspaces.id, sessions.workspaceId))
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
        workspaceStatus: (row.workspaceStatus as WorkspaceStatus | null) ?? null,
        expiresAt,
      };
    });
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
