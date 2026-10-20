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

export interface RecurringJob {
  /** Queue name, e.g. "files.purge". */
  name: string;
  /** Cron in UTC, e.g. "15 3 * * *". pg-boss fires it once per tick across all replicas. */
  cron: string;
  /** Must be idempotent: a job may run again after a crash or redeploy (CLAUDE.md gotchas). */
  handler: () => Promise<void>;
}

/**
 * pg-boss in the API process (PROMPT D10, §13), connected as fitcoach_system. The schema is installed
 * by `migrate.js`, never at boot (`migrate: false`). Modules register their jobs during module init;
 * queues, schedules and workers are set up once pg-boss has started.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly boss: PgBoss;
  private readonly recurring: RecurringJob[] = [];
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

  /** Call from a provider's constructor or onModuleInit (before the application bootstraps). */
  registerRecurring(job: RecurringJob): void {
    if (this.started) throw new Error(`job ${job.name} registered after jobs started`);
    this.recurring.push(job);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.boss.start();
    this.started = true;
    for (const job of this.recurring) {
      await this.boss.createQueue(job.name);
      await this.boss.schedule(job.name, job.cron, null, { tz: "UTC" });
      await this.boss.work(job.name, async () => {
        try {
          await job.handler();
        } catch (error) {
          this.logger.error({ err: error, job: job.name }, "job failed");
          throw error;
        }
      });
    }
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
