import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ERROR_CODES, MAX_UPLOAD_BYTES, type UploadedPhotoResponse } from "@fitcoach/shared";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { ClsService } from "nestjs-cls";
import { PinoLogger } from "nestjs-pino";
import { DomainError } from "../../common/errors/domain-error";
import type { AppClsStore, AuthContext } from "../../common/request-context";
import { DbContext } from "../../db/db-context";
import { files, profiles } from "../../db/schema";
import { SystemDb } from "../../db/system-db";
import {
  type ImageProfile,
  processImage,
  UnsupportedImageError,
} from "../../integrations/storage/images";
import { type BucketKind, StorageService } from "../../integrations/storage/storage.service";
import { JobsService } from "../jobs/jobs.service";

/** Soft-deleted objects are kept this long before the purge job removes them (R2 has no undo). */
export const PURGE_AFTER_DAYS = 7;

interface FileKindSpec {
  bucket: BucketKind;
  profile: ImageProfile;
  /** Key folder; keys are `<prefix><folder>/<workspaceId>/<uuid>.webp` and `…_thumb.webp`. */
  folder: string;
}

/** Kinds in use. `public_page_photo` (step 2.1) and `client_avatar` (private bucket, step 3.1) reuse this pipeline. */
const KINDS = {
  trainer_avatar: { bucket: "public", profile: "avatar", folder: "trainer-avatars" },
} as const satisfies Record<string, FileKindSpec>;

export interface UploadedFile {
  buffer: Buffer;
  size: number;
}

const unsupported = () =>
  new DomainError(ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, 415, "Upload a JPEG, PNG or WebP image.", {
    file: [
      "Upload a JPEG, PNG or WebP image. On iPhone, share the photo as JPEG (Most Compatible).",
    ],
  });

@Injectable()
export class FilesService {
  constructor(
    private readonly storage: StorageService,
    private readonly db: DbContext,
    private readonly systemDb: SystemDb,
    private readonly cls: ClsService<AppClsStore>,
    private readonly logger: PinoLogger,
    jobs: JobsService,
  ) {
    this.logger.setContext(FilesService.name);
    jobs.registerRecurring({
      name: "files.purge",
      cron: "15 3 * * *",
      handler: async () => {
        await this.purgeDeleted();
      },
    });
  }

  private trainer(): AuthContext & { workspaceId: string } {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || !auth.workspaceId) throw DomainError.forbidden();
    return { ...auth, workspaceId: auth.workspaceId };
  }

  private async assertCanStore(): Promise<void> {
    if (!this.storage.configured) {
      throw new DomainError(
        ERROR_CODES.STORAGE_NOT_CONFIGURED,
        503,
        "Photo uploads aren't set up yet. Please try again later.",
      );
    }
    // Refuse before processing anything: a full store must fail loudly, never silently (§17.7).
    const usage = await this.storage.usage();
    if (usage.usedBytes + MAX_UPLOAD_BYTES >= usage.hardLimitBytes) {
      this.logger.error(
        { usedBytes: usage.usedBytes, hardLimitBytes: usage.hardLimitBytes },
        "storage hard limit reached",
      );
      throw new DomainError(
        ERROR_CODES.STORAGE_FULL,
        507,
        "Photo uploads are paused because FitCoach's storage is full. We've been alerted — please try again later.",
      );
    }
  }

  /**
   * Upload pipeline (CLAUDE.md "Cloudflare R2"): budget check → decode the real bytes → strip EXIF →
   * WebP + thumbnail → write both objects → record the ledger row. Originals are never stored.
   */
  private async store(
    kind: keyof typeof KINDS,
    upload: UploadedFile,
    auth: AuthContext & { workspaceId: string },
  ) {
    if (upload.size > MAX_UPLOAD_BYTES) {
      throw new DomainError(ERROR_CODES.PAYLOAD_TOO_LARGE, 413, "Photos can be up to 10 MB.", {
        file: ["Photos can be up to 10 MB."],
      });
    }
    await this.assertCanStore();

    const spec: FileKindSpec = KINDS[kind];
    let image;
    try {
      image = await processImage(upload.buffer, spec.profile);
    } catch (error) {
      if (error instanceof UnsupportedImageError) throw unsupported();
      throw error;
    }

    const id = randomUUID();
    const objectKey = this.storage.key(`${spec.folder}/${auth.workspaceId}/${id}.webp`);
    const thumbnailKey = this.storage.key(`${spec.folder}/${auth.workspaceId}/${id}_thumb.webp`);
    await Promise.all([
      this.storage.put(spec.bucket, objectKey, image.main.data, "image/webp"),
      this.storage.put(spec.bucket, thumbnailKey, image.thumbnail.data, "image/webp"),
    ]);
    const sizeBytes = image.main.data.length + image.thumbnail.data.length;

    // If this insert fails the objects are orphans; the weekly reconciliation (step 5.2) removes them.
    await this.db.tx.insert(files).values({
      id,
      workspaceId: auth.workspaceId,
      uploadedByUserId: auth.userId,
      kind,
      bucket: spec.bucket,
      objectKey,
      thumbnailKey,
      mimeType: "image/webp",
      sizeBytes,
      width: image.main.width,
      height: image.main.height,
      checksum: image.checksum,
    });
    this.storage.noteStored(sizeBytes);
    return { id, objectKey, thumbnailKey };
  }

  /** Replaces the trainer's photo (public bucket — it also appears on their public page). */
  async uploadProfilePhoto(upload: UploadedFile): Promise<UploadedPhotoResponse> {
    const auth = this.trainer();
    const stored = await this.store("trainer_avatar", upload, auth);

    const [previous] = await this.db.tx
      .select({ avatarFileId: profiles.avatarFileId })
      .from(profiles)
      .where(eq(profiles.userId, auth.userId));
    await this.db.tx
      .update(profiles)
      .set({ avatarFileId: stored.id })
      .where(eq(profiles.userId, auth.userId));
    if (previous?.avatarFileId) await this.softDelete(previous.avatarFileId);

    return {
      url: this.storage.publicUrl(stored.objectKey),
      thumbnailUrl: this.storage.publicUrl(stored.thumbnailKey),
    };
  }

  async removeProfilePhoto(): Promise<void> {
    const auth = this.trainer();
    const [profile] = await this.db.tx
      .select({ avatarFileId: profiles.avatarFileId })
      .from(profiles)
      .where(eq(profiles.userId, auth.userId));
    if (!profile?.avatarFileId) return;
    await this.db.tx
      .update(profiles)
      .set({ avatarFileId: null })
      .where(eq(profiles.userId, auth.userId));
    await this.softDelete(profile.avatarFileId);
  }

  private async softDelete(fileId: string): Promise<void> {
    await this.db.tx
      .update(files)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(files.id, fileId), isNull(files.deletedAt)));
  }

  /** Public URL of a profile's photo, for `/auth/me`. */
  avatarUrl(objectKey: string | null): string | null {
    return objectKey && this.storage.configured ? this.storage.publicUrl(objectKey) : null;
  }

  /**
   * Daily job: removes objects soft-deleted more than 7 days ago, then marks the rows purged (the
   * ledger keeps them). Idempotent — deleting an already-deleted object is a no-op in S3.
   */
  async purgeDeleted(): Promise<number> {
    if (!this.storage.configured) return 0;
    const due = await this.systemDb.run("files: find soft-deleted files due for purge", (tx) =>
      tx
        .select({
          id: files.id,
          bucket: files.bucket,
          objectKey: files.objectKey,
          thumbnailKey: files.thumbnailKey,
        })
        .from(files)
        .where(
          and(
            isNotNull(files.deletedAt),
            isNull(files.purgedAt),
            lt(files.deletedAt, sql`now() - make_interval(days => ${PURGE_AFTER_DAYS})`),
          ),
        )
        .limit(500),
    );
    for (const bucket of ["public", "private"] as const) {
      const keys = due
        .filter((file) => file.bucket === bucket)
        .flatMap((file) =>
          [file.objectKey, file.thumbnailKey].filter((key): key is string => key !== null),
        );
      await this.storage.delete(bucket, keys);
    }
    if (due.length > 0) {
      await this.systemDb.run("files: mark purged files", (tx) =>
        tx
          .update(files)
          .set({ purgedAt: sql`now()` })
          .where(
            inArray(
              files.id,
              due.map((file) => file.id),
            ),
          ),
      );
      this.logger.info({ purged: due.length }, "purged soft-deleted files");
    }
    return due.length;
  }
}
