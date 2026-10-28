import type { ActorKind, WorkspaceStatus } from "@fitcoach/shared";
import type { ClsStore } from "nestjs-cls";

export type Actor = ActorKind;

/**
 * Who is making the request. Set only by SessionGuard from the resolved session — never from
 * request bodies, params or headers (CLAUDE.md rule 1).
 */
export interface AuthContext {
  userId: string;
  actor: Actor;
  workspaceId: string | null;
  clientId: string | null;
  sessionId: string;
  workspaceStatus: WorkspaceStatus | null;
}

/** Per-request state held in AsyncLocalStorage via nestjs-cls. */
export interface AppClsStore extends ClsStore {
  auth?: AuthContext;
  /**
   * The request transaction opened by DbContextInterceptor, with RLS context applied. Typed as unknown
   * because nestjs-cls derives key paths from the store type and Drizzle's Tx is too deep for that;
   * DbContext.tx is the only reader and narrows it.
   */
  tx?: unknown;
  /** Callbacks DbContext.afterCommit queued; run once the request transaction has committed. */
  afterCommit?: (() => Promise<void>)[];
}
