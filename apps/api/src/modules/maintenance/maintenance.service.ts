import { Injectable } from "@nestjs/common";
import { isNull, sql } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import type { Tx } from "../../db/database";
import { files } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { StorageService } from "../../integrations/storage/storage.service";
import { JobsService } from "../jobs/jobs.service";

/** Object keys that aren't uploads: health probes, DB backups and exports have their own lifecycle. */
const NOT_UPLOADS = /(^|\/)(health|backups|exports)\//;

const removed = async (tx: Tx, query: ReturnType<typeof sql>) =>
  (await tx.execute(query)).rowCount ?? 0;

/**
 * Housekeeping (PROMPT §13): hourly purges of spent tokens, rate-limit buckets, idempotency keys,
 * old sessions and job history; a weekly check of the storage ledger against the buckets. Spans
 * every workspace, so fitcoach_system. Nothing user-visible is deleted.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly systemDb: SystemDb,
    private readonly storage: StorageService,
    private readonly logger: PinoLogger,
    jobs: JobsService,
  ) {
    this.logger.setContext(MaintenanceService.name);
    jobs.registerRecurring({
      name: "maintenance.purge",
      cron: "20 * * * *",
      handler: () => this.purge(),
    });
    jobs.registerRecurring({
      name: "storage.reconcile",
      cron: "0 4 * * 0",
      handler: () => this.reconcileStorage(),
    });
  }

  /**
   * Spent auth tokens and OTPs (expired or used, kept a day for debugging), expired rate-limit
   * buckets and idempotency keys, sessions ended 30+ days ago, job runs older than 30 days.
   * Invite links stay: their status (expired, used) is shown to the trainer.
   */
  purge(): Promise<Record<string, number>> {
    return this.systemDb.run(
      "maintenance: purge spent tokens, buckets, keys and sessions",
      async (tx) => ({
        authTokens: await removed(
          tx,
          sql`delete from auth_tokens where expires_at < now() - interval '1 day'
          or consumed_at < now() - interval '1 day'`,
        ),
        rateLimitBuckets: await removed(
          tx,
          sql`delete from rate_limit_buckets where expires_at < now()`,
        ),
        idempotencyKeys: await removed(
          tx,
          sql`delete from idempotency_keys where expires_at < now()`,
        ),
        sessions: await removed(
          tx,
          sql`delete from sessions where revoked_at < now() - interval '30 days'
          or expires_at < now() - interval '30 days'`,
        ),
        jobRuns: await removed(
          tx,
          sql`delete from job_runs where started_at < now() - interval '30 days'`,
        ),
      }),
    );
  }

  /**
   * Weekly: compares the `files` ledger with what the buckets hold (§17.7). Reports objects the
   * ledger doesn't know (orphans) and ledger rows whose object is missing. It never deletes: R2 has no
   * versioning, so an operator decides.
   */
  async reconcileStorage(): Promise<Record<string, number | string>> {
    if (!this.storage.configured) return { skipped: "storage not configured" };
    const ledger = await this.systemDb.run("storage: read the files ledger", (tx) =>
      tx
        .select({
          bucket: files.bucket,
          objectKey: files.objectKey,
          thumbnailKey: files.thumbnailKey,
          sizeBytes: files.sizeBytes,
        })
        .from(files)
        .where(isNull(files.purgedAt)),
    );
    const result: Record<string, number> = {};
    for (const bucket of ["public", "private"] as const) {
      const expected = new Set(
        ledger
          .filter((file) => file.bucket === bucket)
          .flatMap((file) => [file.objectKey, file.thumbnailKey])
          .filter((key): key is string => key !== null),
      );
      const stored = (await this.storage.list(bucket)).filter(
        (item) => !NOT_UPLOADS.test(item.key),
      );
      const storedKeys = new Set(stored.map((item) => item.key));
      const orphans = stored.filter((item) => !expected.has(item.key));
      const missing = [...expected].filter((key) => !storedKeys.has(key));
      result[`${bucket}Objects`] = stored.length;
      result[`${bucket}Bytes`] = stored.reduce((total, item) => total + item.size, 0);
      result[`${bucket}Orphans`] = orphans.length;
      result[`${bucket}Missing`] = missing.length;
      if (orphans.length > 0 || missing.length > 0) {
        this.logger.warn(
          { bucket, orphans: orphans.length, missing: missing.length },
          "storage ledger and bucket differ",
        );
      }
    }
    result.ledgerBytes = ledger.reduce((total, file) => total + Number(file.sizeBytes), 0);
    return result;
  }
}
