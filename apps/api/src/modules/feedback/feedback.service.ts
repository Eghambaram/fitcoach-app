import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { FeedbackRequest } from "@fitcoach/shared";
import { ClsService } from "nestjs-cls";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore } from "../../common/request-context";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { DbContext } from "../../db/db-context";
import { feedback } from "../../db/schema";
import { trackEvent } from "../product-events/track";

/**
 * "Send feedback" (PROMPT §16.0): stored for the platform owner to triage (step 6.1). The trainer
 * can't read it back, so the response only confirms it was saved.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly rateLimit: RateLimitService,
  ) {}

  async send(input: FeedbackRequest): Promise<{ id: string }> {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    await this.rateLimit.consume({
      key: `feedback:user:${auth.userId}`,
      windowSeconds: 60 * 60,
      max: 10,
    });
    // No RETURNING: trainers can't read feedback back (no SELECT grant), so the id is made here.
    const id = randomUUID();
    await this.db.tx.insert(feedback).values({
      id,
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      page: input.page ?? null,
      message: input.message,
    });
    await trackEvent(this.db.tx, {
      event: "feedback_sent",
      actorKind: "trainer",
      userId: auth.userId,
      workspaceId: auth.workspaceId,
    });
    return { id };
  }
}
