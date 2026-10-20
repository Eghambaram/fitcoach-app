import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import { Pool } from "pg";
import { AppConfig } from "../config/env";
import type { Database, Tx } from "./database";
import * as schema from "./schema";

/**
 * The only way to use `fitcoach_system` (BYPASSRLS) — CLAUDE.md rule 4.
 * Allowed for: background jobs, pre-session auth lookups, the public enquiry insert, platform aggregates
 * and audited admin actions. Every call states why; callers that change data also write audit_logs.
 */
@Injectable()
export class SystemDb implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly db: Database;

  constructor(
    config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SystemDb.name);
    this.pool = new Pool({
      connectionString: config.databaseSystemUrl,
      // System work is rare compared with request traffic; keep its share of connections small.
      max: Math.max(2, Math.floor(config.dbPoolMax / 2)),
      application_name: "fitcoach-api-system",
      idleTimeoutMillis: 30_000,
    });
    this.db = drizzle({ client: this.pool, schema });
  }

  /**
   * Runs `fn` in its own transaction as fitcoach_system. `reason` is a short, fixed description of the
   * call site (e.g. "auth: look up session by token hash") and is logged — never put user data in it.
   */
  async run<T>(reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!reason.trim()) {
      throw new Error("SystemDb.run requires a reason");
    }
    this.logger.debug({ systemDbReason: reason }, "system db access");
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.actor', 'system', true)`);
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
