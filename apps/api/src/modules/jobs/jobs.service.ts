import {
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { DependencyCheck } from "@fitcoach/shared";
import { PinoLogger } from "nestjs-pino";
import { PgBoss } from "pg-boss";
import { AppConfig } from "../../config/env";
import { PGBOSS_SCHEMA } from "../../db/run-migrations";

/**
 * pg-boss in the API process (PROMPT D10, §13), connected as fitcoach_system. The schema is installed
 * by `migrate.js`, never at boot (`migrate: false`). Queues and schedules are registered by the
 * modules that own them (step 5.2); this step only owns the lifecycle.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly boss: PgBoss;
  private started = false;

  constructor(
    config: AppConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(JobsService.name);
    this.boss = new PgBoss({
      connectionString: config.databaseSystemUrl,
      schema: PGBOSS_SCHEMA,
      max: 3,
      migrate: false,
      createSchema: false,
      application_name: "fitcoach-api-jobs",
    });
    this.boss.on("error", (error: unknown) => this.logger.error({ err: error }, "pg-boss error"));
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();
    this.started = true;
  }

  /** SIGTERM from a Railway redeploy: let running handlers finish instead of dropping them. */
  async onApplicationShutdown(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    await this.boss.stop({ graceful: true, close: true, timeout: 20_000 });
  }

  async check(): Promise<DependencyCheck> {
    if (!this.started) return { status: "degraded" };
    const startedAt = Date.now();
    try {
      const version = await this.boss.schemaVersion();
      return version === null
        ? { status: "degraded" }
        : { status: "ok", latencyMs: Date.now() - startedAt };
    } catch (error) {
      this.logger.warn({ err: error }, "pg-boss readiness check failed");
      return { status: "degraded" };
    }
  }
}
