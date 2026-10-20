import type { ProductEventName, ProductEventProperties } from "@fitcoach/shared";
import type { Tx } from "../../db/database";
import { productEvents } from "../../db/schema";

export interface TrackedEvent {
  event: ProductEventName;
  actorKind: "trainer" | "client" | "platform_owner" | "system";
  userId: string | null;
  workspaceId: string | null;
  /** Ids, counts, enums and booleans only — never names, emails, phones, free text or health data. */
  properties?: ProductEventProperties;
}

/**
 * Records a product event for the beta metrics (PROMPT §1A.5, ADR-0030) inside the caller's
 * transaction, so an event only exists if the action it describes committed.
 */
export async function trackEvent(tx: Tx, event: TrackedEvent): Promise<void> {
  await tx.insert(productEvents).values({
    event: event.event,
    actorKind: event.actorKind,
    userId: event.userId,
    workspaceId: event.workspaceId,
    properties: event.properties ?? {},
  });
}
