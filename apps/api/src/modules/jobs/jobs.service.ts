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
import { jobRuns } from "../../db/schema";
import { SystemDb } from "../../db/system-db";

export interface RecurringJob {
  /** Queue name, e.g. "files.purge". */
  name: string;
  /** Cron in UTC, e.g. "15 3 * * *". pg-boss fires it once per tick across all replicas. */
  cron: string;
  /**
   * Must be idempotent: a job may run again after a crash or redeploy (CLAUDE.md gotchas). May
   * return a small summary (counts), recorded in `job_runs` for the health page.
   */
  handler: () => Promise<unknown>;
}

/**
 * pg-boss in the API process (PROMPT D10, §13), connected as fitcoach_system. The schema is installed
 * by `migrate.js`, never at boot (`migrate: false`). Modules register their jobs during module init;
 * queues, schedules and workers are set up once pg-boss has started. Every run's outcome is recorded
 * in `job_runs` (PROMPT §13) for the Platform Health page.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly boss: PgBoss;
  private readonly recurring: RecurringJob[] = [];
  private started = false;

  constructor(
    config: AppConfig,
    private readonly logger: PinoLogger,
    private readonly systemDb: SystemDb,
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
      await this.boss.work(job.name, () => this.run(job));
    }
  }

  /** Runs a job and records the outcome; a failure is rethrown so pg-boss retries it. */
  async run(job: RecurringJob): Promise<void> {
    const startedAt = new Date();
    try {
      const result = await job.handler();
      const summary =
        typeof result === "object" && result !== null && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : {};
      await this.record(job.name, startedAt, "succeeded", summary, null);
    } catch (error) {
      this.logger.error({ err: error, job: job.name }, "job failed");
      const message = error instanceof Error ? error.message : "unknown error";
      await this.record(job.name, startedAt, "failed", {}, message.slice(0, 1000));
      throw error;
    }
  }

  private async record(
    name: string,
    startedAt: Date,
    status: "succeeded" | "failed",
    summary: Record<string, unknown>,
    error: string | null,
  ): Promise<void> {
    try {
      await this.systemDb.run("jobs: record a job run outcome", (tx) =>
        tx.insert(jobRuns).values({ name, status, startedAt, summary, error }),
      );
    } catch (failure) {
      this.logger.warn({ err: failure, job: name }, "could not record job outcome");
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
