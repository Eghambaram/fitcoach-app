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
 * Writes an immutable audit entry (PROMPT §12.1) in the transaction that performs the change, so it
 * commits or rolls back with it. In a request transaction (fitcoach_app) RLS only accepts entries
 * matching the session's own user/workspace/actor; SystemDb transactions may record any actor.
 * No RETURNING: fitcoach_app has INSERT but not SELECT on audit_logs.
 */
export async function recordAudit(tx: Tx, entry: AuditEntry): Promise<void> {
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

/** Injectable wrapper so services can depend on auditing (and tests can replace it). */
@Injectable()
export class AuditService {
  record(tx: Tx, entry: AuditEntry): Promise<void> {
    return recordAudit(tx, entry);
  }
}
