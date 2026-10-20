import { Injectable } from "@nestjs/common";
import type { DependencyCheck, ReadinessResponse } from "@fitcoach/shared";
import { PinoLogger } from "nestjs-pino";
import { AppDatabase } from "../../db/database";
import { JobsService } from "../jobs/jobs.service";

const CHECK_TIMEOUT_MS = 2_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

@Injectable()
export class HealthService {
  constructor(
    private readonly database: AppDatabase,
    private readonly jobs: JobsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthService.name);
  }

  async readiness(): Promise<ReadinessResponse> {
    const [database, jobs] = await Promise.all([this.checkDatabase(), this.jobs.check()]);
    // Object storage is wired up in step 1.5; until then it is honestly "not_configured".
    const storage: DependencyCheck = { status: "not_configured" };

    const checks = { database, jobs, storage };
    const healthy = Object.values(checks).every(
      (check) => check.status === "ok" || check.status === "not_configured",
    );
    return { status: healthy ? "ok" : "degraded", checks };
  }

  private async checkDatabase(): Promise<DependencyCheck> {
    const startedAt = Date.now();
    try {
      await withTimeout(this.database.pool.query("select 1"), CHECK_TIMEOUT_MS);
      return { status: "ok", latencyMs: Date.now() - startedAt };
    } catch (error) {
      this.logger.warn({ err: error }, "database readiness check failed");
      return { status: "degraded" };
    }
  }
}
