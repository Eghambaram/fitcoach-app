import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { AppConfig } from "../config/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** A Drizzle transaction handle — what repositories receive. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Connection pool for request traffic as `fitcoach_app` (NOBYPASSRLS, PROMPT §4.5).
 * Repositories never use this directly: they use the request transaction from DbContext.
 */
@Injectable()
export class AppDatabase implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: Database;

  constructor(config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.dbPoolMax,
      application_name: "fitcoach-api",
      idleTimeoutMillis: 30_000,
    });
    this.db = drizzle({ client: this.pool, schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
