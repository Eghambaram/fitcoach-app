import { Injectable } from "@nestjs/common";
import { ERROR_CODES } from "@fitcoach/shared";
import { sql } from "drizzle-orm";
import { SystemDb } from "../../db/system-db";
import { DomainError } from "../errors/domain-error";

export interface RateLimitRule {
  /** Already-hashed identity, e.g. `login:ip:<ipHash>` — never a raw IP or email. */
  key: string;
  windowSeconds: number;
  max: number;
}

/**
 * Postgres-backed fixed-window rate limits (PROMPT §12.1) via app.check_rate_limit(), which only
 * fitcoach_system may call. Every rule is counted; any rule over its limit rejects with 429.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly systemDb: SystemDb) {}

  async consume(...rules: RateLimitRule[]): Promise<void> {
    const allowed = await this.systemDb.run("rate limit: count attempts", async (tx) => {
      const results: boolean[] = [];
      for (const rule of rules) {
        const result = await tx.execute<{ allowed: boolean }>(
          sql`select app.check_rate_limit(${rule.key}, ${rule.windowSeconds}, ${rule.max}) as allowed`,
        );
        results.push(result.rows[0]?.allowed === true);
      }
      return results.every(Boolean);
    });
    if (!allowed) {
      throw new DomainError(
        ERROR_CODES.RATE_LIMITED,
        429,
        "Too many attempts. Please wait a few minutes and try again.",
      );
    }
  }
}
