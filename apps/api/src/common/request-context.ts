import type { ClsStore } from "nestjs-cls";
import type { Tx } from "../db/database";

export type Actor = "trainer" | "client" | "platform_owner";

/**
 * Who is making the request. Set only by the session guard from the resolved session (step 1.3) —
 * never from request bodies, params or headers (CLAUDE.md rule 1).
 */
export interface AuthContext {
  userId: string;
  actor: Actor;
  workspaceId: string | null;
  clientId: string | null;
}

/** Per-request state held in AsyncLocalStorage via nestjs-cls. */
export interface AppClsStore extends ClsStore {
  auth?: AuthContext;
  /** The request transaction opened by DbContextInterceptor, with RLS context applied. */
  tx?: Tx;
}
