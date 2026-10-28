import { Injectable } from "@nestjs/common";
import {
  type DataExport,
  type DataExportListResponse,
  ERROR_CODES,
  EXPORT_AVAILABLE_HOURS,
  type ExportStatus,
} from "@fitcoach/shared";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { PinoLogger } from "nestjs-pino";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore } from "../../common/request-context";
import { RateLimitService } from "../../common/security/rate-limit.service";
import { DbContext } from "../../db/db-context";
import { dataExports, workspaces } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import { StorageService } from "../../integrations/storage/storage.service";
import { JobsService } from "../jobs/jobs.service";
import { trackEvent } from "../product-events/track";
import { buildExportCsvs, zipCsvs } from "./export-builder";

export const EXPORT_QUEUE = "exports.generate";
const LIST_LIMIT = 10;
/** A pending export older than this is treated as lost (the job retried and gave up). */
const STALE_PENDING_MINUTES = 30;

interface ExportJobData {
  exportId: string;
}

type ExportRow = typeof dataExports.$inferSelect;

/**
 * Workspace data export (PROMPT §8.12, ADR-0061): the trainer asks; a background job writes a zip
 * of CSVs to the private bucket; the trainer downloads it through the API (auth-checked on every
 * download) for 24 hours; maintenance deletes it afterwards. Allowed in a suspended workspace.
 */
@Injectable()
export class ExportsService {
  constructor(
    private readonly db: DbContext,
    private readonly cls: ClsService<AppClsStore>,
    private readonly systemDb: SystemDb,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly rateLimit: RateLimitService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ExportsService.name);
    jobs.registerQueue<ExportJobData>({
      name: EXPORT_QUEUE,
      handler: (data) => this.generate(data.exportId),
    });
    jobs.registerRecurring({
      name: "exports.expire",
      cron: "40 * * * *",
      handler: async () => ({ expired: await this.expire() }),
    });
  }

  private trainer() {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { userId: auth.userId, workspaceId: auth.workspaceId };
  }

  async list(): Promise<DataExportListResponse> {
    const { workspaceId } = this.trainer();
    const rows = await this.db.tx
      .select()
      .from(dataExports)
      .where(eq(dataExports.workspaceId, workspaceId))
      .orderBy(desc(dataExports.createdAt))
      .limit(LIST_LIMIT);
    return { available: this.storage.configured, exports: rows.map(toDto) };
  }

  async request(): Promise<DataExport> {
    const trainer = this.trainer();
    if (!this.storage.configured) {
      throw new DomainError(
        ERROR_CODES.STORAGE_NOT_CONFIGURED,
        503,
        "File storage isn't set up yet, so exports can't be made.",
      );
    }
    const [pending] = await this.db.tx
      .select({ id: dataExports.id })
      .from(dataExports)
      .where(
        and(
          eq(dataExports.workspaceId, trainer.workspaceId),
          eq(dataExports.status, "pending"),
          sql`${dataExports.createdAt} > now() - make_interval(mins => ${STALE_PENDING_MINUTES})`,
        ),
      )
      .limit(1);
    if (pending) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        "An export is already being prepared. It will appear here when it's ready.",
      );
    }
    await this.rateLimit.consume({
      key: `export:workspace:${trainer.workspaceId}`,
      windowSeconds: 24 * 60 * 60,
      max: 5,
    });
    const [row] = await this.db.tx
      .insert(dataExports)
      .values({ workspaceId: trainer.workspaceId, requestedByUserId: trainer.userId })
      .returning();
    if (!row) throw new Error("export insert returned nothing");
    this.db.afterCommit(() => this.jobs.send(EXPORT_QUEUE, { exportId: row.id }));
    return toDto(row);
  }

  /** The zip's bytes, after checking (through RLS and the filter) it's this workspace's and live. */
  async download(id: string): Promise<{ body: Buffer; filename: string }> {
    const { workspaceId } = this.trainer();
    const [row] = await this.db.tx
      .select()
      .from(dataExports)
      .where(and(eq(dataExports.id, id), eq(dataExports.workspaceId, workspaceId)));
    if (!row) throw DomainError.notFound("That export doesn't exist.");
    if (row.status !== "ready" || !row.objectKey || !row.expiresAt || row.expiresAt <= new Date()) {
      throw new DomainError(
        ERROR_CODES.CONFLICT_STATE,
        409,
        row.status === "pending"
          ? "This export is still being prepared."
          : "This export is no longer available. Request a new one.",
      );
    }
    const body = await this.storage.getPrivate(row.objectKey);
    return { body, filename: `fitcoach-export-${row.createdAt.toISOString().slice(0, 10)}.zip` };
  }

  /**
   * The job (fitcoach_system, every query filtered by the export's workspace). Idempotent: a
   * finished export is left alone, and a retry overwrites the same object key.
   */
  async generate(exportId: string): Promise<Record<string, unknown>> {
    try {
      // One transaction holds the export row locked (SKIP LOCKED) from reading to "ready", so a
      // queued run and a retry can never both build it: the second sees it busy or finished, and
      // can't re-upload a file that expiry has already deleted.
      return await this.systemDb.run("exports: build one workspace's export", async (tx) => {
        const [row] = await tx
          .select()
          .from(dataExports)
          .where(and(eq(dataExports.id, exportId), eq(dataExports.status, "pending")))
          .for("update", { skipLocked: true });
        if (!row) return { skipped: "not pending, or another run has it" };
        const [workspace] = await tx
          .select({ timezone: workspaces.timezone })
          .from(workspaces)
          .where(eq(workspaces.id, row.workspaceId));
        if (!workspace) throw new Error("workspace not found");
        const zip = await zipCsvs(await buildExportCsvs(tx, row.workspaceId, workspace.timezone));
        const objectKey = this.storage.key(`exports/${row.workspaceId}/${row.id}.zip`);
        await this.storage.put("private", objectKey, zip, "application/zip");
        await tx
          .update(dataExports)
          .set({
            status: "ready",
            objectKey,
            sizeBytes: zip.length,
            completedAt: sql`now()`,
            expiresAt: sql`now() + make_interval(hours => ${EXPORT_AVAILABLE_HOURS})`,
          })
          .where(eq(dataExports.id, row.id));
        await trackEvent(tx, {
          event: "data_exported",
          actorKind: "system",
          userId: row.requestedByUserId,
          workspaceId: row.workspaceId,
          properties: { sizeBytes: zip.length },
        });
        return { exportId: row.id, sizeBytes: zip.length };
      });
    } catch (error) {
      this.logger.error({ err: error, exportId }, "export failed");
      await this.systemDb.run("exports: mark the export failed", (tx) =>
        tx
          .update(dataExports)
          .set({
            status: "failed",
            error: "The export could not be built.",
            completedAt: sql`now()`,
          })
          .where(and(eq(dataExports.id, exportId), eq(dataExports.status, "pending"))),
      );
      return { exportId, failed: true };
    }
  }

  /**
   * Maintenance: exports stuck pending (their job gave up) become failed; finished exports past their
   * window become expired and their objects are deleted.
   */
  async expire(): Promise<number> {
    await this.systemDb.run("exports: fail exports whose job was lost", (tx) =>
      tx
        .update(dataExports)
        .set({ status: "failed", error: "The export timed out.", completedAt: sql`now()` })
        .where(
          and(
            eq(dataExports.status, "pending"),
            lt(dataExports.createdAt, sql`now() - make_interval(mins => ${STALE_PENDING_MINUTES})`),
          ),
        ),
    );
    const due = await this.systemDb.run("exports: find expired exports", (tx) =>
      tx
        .select({ id: dataExports.id, objectKey: dataExports.objectKey })
        .from(dataExports)
        .where(and(eq(dataExports.status, "ready"), lt(dataExports.expiresAt, sql`now()`))),
    );
    if (due.length === 0) return 0;
    if (this.storage.configured) {
      await this.storage.delete(
        "private",
        due.map((item) => item.objectKey).filter((key): key is string => key !== null),
      );
    }
    await this.systemDb.run("exports: mark exports expired", (tx) =>
      tx
        .update(dataExports)
        .set({ status: "expired" })
        .where(
          inArray(
            dataExports.id,
            due.map((item) => item.id),
          ),
        ),
    );
    return due.length;
  }
}

function toDto(row: ExportRow): DataExport {
  const expired =
    row.status === "ready" && row.expiresAt !== null && row.expiresAt.getTime() <= Date.now();
  return {
    id: row.id,
    status: (expired ? "expired" : row.status) as ExportStatus,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    sizeBytes: row.sizeBytes,
  };
}
