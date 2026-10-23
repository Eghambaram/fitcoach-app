import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@fitcoach/shared";
import { and, eq, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { z } from "zod";
import { DbContext } from "../../db/db-context";
import { idempotencyKeys } from "../../db/schema";
import { DomainError } from "../errors/domain-error";
import type { AppClsStore } from "../request-context";

const keySchema = z.string().uuid();

function hashRequest(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? null))
    .digest("hex");
}

/**
 * `Idempotency-Key` for critical mutations (PROMPT §4.3, CLAUDE.md rule 15). Runs inside the request
 * transaction: the key row is inserted first, so a concurrent request with the same key waits on the
 * unique index until the first one commits (then replays its stored answer) or rolls back (then
 * runs itself). Keys expire after 24 hours and are purged by a job (step 5.2).
 */
@Injectable()
export class IdempotencyService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async run<T>(
    endpoint: string,
    key: string | undefined,
    request: unknown,
    action: () => Promise<T>,
  ): Promise<T> {
    if (key === undefined) return action();
    if (!keySchema.safeParse(key).success) {
      throw new DomainError(ERROR_CODES.VALIDATION_FAILED, 400, "Invalid Idempotency-Key.", {
        "Idempotency-Key": ["Use a UUID"],
      });
    }
    const auth = this.cls.get("auth");
    if (!auth) throw DomainError.forbidden();
    const requestHash = hashRequest(request);

    const [claimed] = await this.db.tx
      .insert(idempotencyKeys)
      .values({
        workspaceId: auth.workspaceId ?? null,
        userId: auth.userId,
        key,
        endpoint,
        requestHash,
        expiresAt: sql`now() + interval '24 hours'`,
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyKeys.id });

    if (!claimed) {
      const [previous] = await this.db.tx
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.userId, auth.userId),
            eq(idempotencyKeys.endpoint, endpoint),
            eq(idempotencyKeys.key, key),
          ),
        );
      if (!previous || previous.requestHash !== requestHash) {
        throw new DomainError(
          ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
          422,
          "This request was already sent with different details. Reload and try again.",
        );
      }
      return previous.responseBody as T;
    }

    const result = await action();
    await this.db.tx
      .update(idempotencyKeys)
      .set({ responseStatus: 200, responseBody: result as object })
      .where(eq(idempotencyKeys.id, claimed.id));
    return result;
  }
}
