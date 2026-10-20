import { Injectable } from "@nestjs/common";
import type { Tx } from "../../db/database";
import { auditLogs } from "../../db/schema";

export type AuditActorKind = "trainer" | "client" | "platform_owner" | "system" | "cli";

export interface AuditEntry {
  actorKind: AuditActorKind;
  actorUserId: string | null;
  workspaceId: string | null;
  /** Dotted verb, e.g. "workspace.suspended", "platform_role.granted". */
  action: string;
  targetType?: string;
  targetId?: string;
  reason?: string;
  /** Redacted snapshots only — never passwords, tokens or health data. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ipHash?: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Writes immutable audit entries (PROMPT §12.1). Pass the transaction that performs the change, so the
 * audit row commits or rolls back with it. With a request transaction (fitcoach_app) RLS only accepts
 * rows matching the session's own user/workspace/actor; SystemDb transactions may record any actor.
 */
@Injectable()
export class AuditService {
  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    // No RETURNING: fitcoach_app has INSERT but not SELECT on audit_logs.
    await tx.insert(auditLogs).values({
      actorKind: entry.actorKind,
      actorUserId: entry.actorUserId,
      workspaceId: entry.workspaceId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      reason: entry.reason,
      before: entry.before,
      after: entry.after,
      ipHash: entry.ipHash,
      userAgent: entry.userAgent?.slice(0, 300),
      requestId: entry.requestId,
    });
  }
}
