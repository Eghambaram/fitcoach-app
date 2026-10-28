import { Injectable } from "@nestjs/common";
import { type BackupHeartbeat, ERROR_CODES, type HealthItem } from "@fitcoach/shared";
import { desc, eq } from "drizzle-orm";
import { DomainError } from "../../common/errors/domain-error";
import { RateLimitService } from "../../common/security/rate-limit.service";
import type { RequestMeta } from "../../common/security/request-meta";
import { safeEqual } from "../../common/security/tokens";
import { AppConfig } from "../../config/env";
import { backupRuns } from "../../db/schema";
import { SystemDb } from "../../db/system-db";

/** A nightly job: more than this since the last good dump means a night was missed. */
const BACKUP_STALE_HOURS = 26;

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

/**
 * Nightly backup heartbeats (PROMPT §17.2, ADR-0063). The db-backup cron authenticates with
 * BACKUP_HEARTBEAT_TOKEN over the private network; rows are system-only and append-only.
 */
@Injectable()
export class BackupsService {
  constructor(
    private readonly config: AppConfig,
    private readonly systemDb: SystemDb,
    private readonly rateLimit: RateLimitService,
  ) {}

  async record(
    authorization: string | undefined,
    input: BackupHeartbeat,
    meta: RequestMeta,
  ): Promise<void> {
    await this.rateLimit.consume({
      key: `backup-heartbeat:ip:${meta.ipHash ?? "unknown"}`,
      windowSeconds: 60 * 60,
      max: 20,
    });
    const expected = this.config.backupHeartbeatToken;
    // Without a configured token the endpoint doesn't exist, as far as callers can tell.
    if (!expected) throw DomainError.notFound();
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!safeEqual(token, expected)) {
      throw new DomainError(ERROR_CODES.UNAUTHENTICATED, 401, "Invalid heartbeat token.");
    }
    await this.systemDb.run("backups: record a db-backup heartbeat", (tx) =>
      tx.insert(backupRuns).values({
        status: input.status,
        objectKey: input.objectKey ?? null,
        sizeBytes: input.sizeBytes ?? null,
        startedAt: new Date(input.startedAt),
        finishedAt: new Date(input.finishedAt),
        error: input.error ?? null,
      }),
    );
  }

  /** Platform Health "Backups" (§16.0): OK only with a good dump in the last 26 hours. */
  async health(): Promise<HealthItem> {
    if (!this.config.backupHeartbeatToken) {
      return {
        status: "not_configured",
        detail: "BACKUP_HEARTBEAT_TOKEN isn't set, so the nightly backup can't report in.",
      };
    }
    try {
      const { latest, lastGood } = await this.systemDb.run(
        "backups: read the latest heartbeats",
        async (tx) => {
          const [latestRow] = await tx
            .select()
            .from(backupRuns)
            .orderBy(desc(backupRuns.finishedAt))
            .limit(1);
          const [goodRow] = await tx
            .select()
            .from(backupRuns)
            .where(eq(backupRuns.status, "succeeded"))
            .orderBy(desc(backupRuns.finishedAt))
            .limit(1);
          return { latest: latestRow, lastGood: goodRow };
        },
      );
      if (!latest) {
        return { status: "unknown", detail: "No backup has reported in yet." };
      }
      if (latest.status === "failed") {
        return {
          status: "degraded",
          detail: `The last backup failed${latest.error ? `: ${latest.error.slice(0, 200)}` : "."}`,
        };
      }
      const hours = lastGood ? (Date.now() - lastGood.finishedAt.getTime()) / 3_600_000 : Infinity;
      if (!lastGood || hours > BACKUP_STALE_HOURS) {
        return {
          status: "degraded",
          detail: `No successful backup in the last ${BACKUP_STALE_HOURS} hours.`,
        };
      }
      return {
        status: "ok",
        detail: `${formatSize(lastGood.sizeBytes ?? 0)} dump ${Math.round(hours)} h ago (${lastGood.objectKey}).`,
      };
    } catch {
      return { status: "unknown", detail: "Backup heartbeats couldn't be read." };
    }
  }
}
