import type { NotificationType } from "@fitcoach/shared";
import { findPgCode } from "../../common/errors/to-api-error";
import type { Tx } from "../../db/database";
import { notifications } from "../../db/schema";

export interface NewNotification {
  workspaceId: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Record<string, unknown>;
  /** One notification per recipient and key, e.g. `follow_up:<id>` (PROMPT §13 dedupe keys). */
  dedupeKey: string;
}

/**
 * Adds an in-app notification once: a repeat with the same recipient and dedupe key (a retried job,
 * a restart, a double submit) changes nothing. Runs in the caller's transaction, inside a savepoint.
 *
 * Not `ON CONFLICT DO NOTHING`: under RLS that also checks the caller's SELECT policy against the new
 * row, and a trainer can't read a notification addressed to their client (ADR-0060).
 */
export async function notify(tx: Tx, input: NewNotification): Promise<void> {
  try {
    await tx.transaction(async (savepoint) => {
      await savepoint.insert(notifications).values({
        workspaceId: input.workspaceId,
        recipientUserId: input.recipientUserId,
        type: input.type,
        title: input.title.slice(0, 160),
        body: input.body ? input.body.slice(0, 500) : null,
        link: input.link ?? null,
        data: input.data ?? {},
        dedupeKey: input.dedupeKey,
      });
    });
  } catch (error) {
    // Drizzle wraps the driver error; the unique violation is on its cause.
    if (findPgCode(error) !== "23505") throw error;
  }
}
