import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import { backupKeys, expiredKeys, safeError } from "@fitcoach/shared";
import { PinoLogger } from "nestjs-pino";
import { AppConfig } from "../../config/env";
import { backupRuns } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { StorageService } from "../../integrations/storage/storage.service";
import { JobsService } from "../jobs/jobs.service";

export const BACKUP_RUN_QUEUE = "backups.run";
/** 02:00 IST, the same time as the db-backup cron (PROMPT §17.2). */
const NIGHTLY_CRON = "30 20 * * *";
const TIME_ZONE = "Asia/Kolkata";

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with code ${code}: ${stderr.trim()}`)),
    );
  });
}

/**
 * The nightly database backup inside the API (ADR-0064), for environments without a separate
 * db-backup service (the Railway Hobby beta). Same steps and keys as `infra/db-backup`:
 * pg_dump -Fc with the owner URL → pg_restore --list → private bucket `backups/daily/` (and
 * `backups/weekly/` on Sundays) → retention → a `backup_runs` row, success or failure. pg-boss
 * runs it once per tick across replicas; a platform owner can also run it on demand.
 */
@Injectable()
export class NightlyBackupService {
  constructor(
    private readonly config: AppConfig,
    private readonly systemDb: SystemDb,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NightlyBackupService.name);
    if (config.nightlyBackup !== "in_api") return;
    jobs.registerRecurring({
      name: "backups.nightly",
      cron: NIGHTLY_CRON,
      handler: () => this.backup(),
    });
    jobs.registerQueue<object>({ name: BACKUP_RUN_QUEUE, handler: () => this.backup() });
  }

  /** Why the in-API backup can't run here, or null when it can. */
  unavailable(): string | null {
    if (this.config.nightlyBackup !== "in_api") return "NIGHTLY_BACKUP isn't in_api.";
    if (!this.storage.configured) return "Object storage (STORAGE_*) isn't set.";
    if (!this.config.databaseOwnerUrl) return "DATABASE_OWNER_URL isn't set.";
    return null;
  }

  /** Queues one run now (Platform → System Health → Run backup now). */
  async runNow(): Promise<void> {
    const reason = this.unavailable();
    if (reason) throw new Error(reason);
    await this.jobs.send(BACKUP_RUN_QUEUE, {});
  }

  async backup(): Promise<Record<string, unknown>> {
    const reason = this.unavailable();
    if (reason) return { skipped: reason };
    const ownerUrl = this.config.databaseOwnerUrl ?? "";
    const startedAt = new Date();
    const keys = backupKeys(startedAt, TIME_ZONE, this.storage.key(""));
    const file = join(tmpdir(), `fitcoach-${keys.date}-${startedAt.getTime()}.dump`);
    try {
      await run("pg_dump", ["--format=custom", "--compress=9", `--file=${file}`, ownerUrl]);
      // An unreadable dump is worse than none: check it before uploading.
      await run("pg_restore", ["--list", file]);
      const dump = await readFile(file);
      await this.storage.put("private", keys.daily, dump, "application/octet-stream");
      if (keys.weekly) {
        await this.storage.put("private", keys.weekly, dump, "application/octet-stream");
      }
      const stored = await this.storage.list("private", "backups/");
      const expired = expiredKeys(
        stored.map((item) => item.key),
        keys.date,
      );
      await this.storage.delete("private", expired);
      await this.record({
        status: "succeeded",
        objectKey: keys.daily,
        sizeBytes: dump.length,
        startedAt,
        error: null,
      });
      this.logger.info(
        { key: keys.daily, sizeBytes: dump.length, deleted: expired.length },
        "nightly backup succeeded",
      );
      return { key: keys.daily, sizeBytes: dump.length, deleted: expired.length };
    } catch (error) {
      const message = safeError(error);
      this.logger.error({ error: message }, "nightly backup failed");
      await this.record({
        status: "failed",
        objectKey: null,
        sizeBytes: null,
        startedAt,
        error: message,
      });
      // Recorded for the health page; not retried in a loop (the next night tries again).
      return { failed: message };
    } finally {
      await rm(file, { force: true });
    }
  }

  private async record(run: {
    status: "succeeded" | "failed";
    objectKey: string | null;
    sizeBytes: number | null;
    startedAt: Date;
    error: string | null;
  }): Promise<void> {
    await this.systemDb.run("backups: record an in-API backup run", (tx) =>
      tx.insert(backupRuns).values({ ...run, finishedAt: new Date() }),
    );
  }
}
