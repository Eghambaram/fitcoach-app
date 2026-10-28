import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import type { DependencyCheck } from "@fitcoach/shared";
import { isNull, sql } from "drizzle-orm";
import { PinoLogger } from "nestjs-pino";
import { AppConfig, type StorageConfig } from "../../config/env";
import { files } from "../../db/schema";
import { SystemDb } from "../../db/system-db";

export type BucketKind = "private" | "public";

/** Presigned GETs for private objects expire within 5 minutes (CLAUDE.md, PROMPT §17.7). */
export const PRESIGN_MAX_SECONDS = 300;
/**
 * Readiness reads a key that never exists: `NoSuchKey` proves the bucket exists and the credentials
 * are accepted (a HEAD can't tell a missing key from a missing bucket). HeadBucket isn't used because
 * R2 tokens scoped to "Object Read & Write" on specific buckets may be refused bucket-level calls
 * (ADR-0042). One Class B operation per bucket per check.
 */
const PROBE_KEY = "health/readiness-probe";
/** `files.size_bytes` sums are cached this long (§17.7). */
const USAGE_CACHE_MS = 5 * 60 * 1000;

export function createS3Client(storage: StorageConfig): S3Client {
  return new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey },
    // R2 and RustFS want path-style bucket addressing.
    forcePathStyle: true,
    // Newer SDKs send checksum headers by default; R2 rejects some of them (CLAUDE.md gotchas).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export interface StorageUsage {
  usedBytes: number;
  budgetBytes: number;
  hardLimitBytes: number;
}

/**
 * Object storage boundary (PROMPT §11): Cloudflare R2 deployed, RustFS locally — same code path, only
 * env differs. Uploads go through the API only; nothing here is ever exposed to the browser except
 * public-bucket URLs and short-lived presigned GETs issued after an authorization check.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly storage: StorageConfig | null;
  private readonly client: S3Client | null;
  private usageCache: { value: number; at: number } | undefined;

  constructor(
    config: AppConfig,
    private readonly systemDb: SystemDb,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(StorageService.name);
    this.storage = config.storage;
    this.client = config.storage ? createS3Client(config.storage) : null;
  }

  get configured(): boolean {
    return this.storage !== null;
  }

  private require(): { storage: StorageConfig; client: S3Client } {
    if (!this.storage || !this.client) throw new Error("object storage is not configured");
    return { storage: this.storage, client: this.client };
  }

  private bucketName(bucket: BucketKind): string {
    const { storage } = this.require();
    return bucket === "public" ? storage.publicBucket : storage.privateBucket;
  }

  /** Prefixes keys for PR environments that share the staging buckets (`pr-<n>/`). */
  key(path: string): string {
    return `${this.require().storage.keyPrefix}${path}`;
  }

  async put(bucket: BucketKind, key: string, body: Buffer, contentType: string): Promise<void> {
    const { client } = this.require();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucketName(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
        // Keys are immutable UUIDs, so public objects can be cached forever (no purges, §17.7).
        CacheControl:
          bucket === "public" ? "public, max-age=31536000, immutable" : "private, no-store",
      }),
    );
  }

  /** URL for a public-bucket object, served from `media.<domain>` via Cloudflare's CDN in production. */
  publicUrl(key: string): string {
    return `${this.require().storage.publicBaseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  /** Short-lived URL for a private object. Call only after checking the caller may see it. */
  presignGet(key: string, expiresInSeconds = PRESIGN_MAX_SECONDS): Promise<string> {
    const { client } = this.require();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucketName("private"), Key: key }),
      {
        expiresIn: Math.min(expiresInSeconds, PRESIGN_MAX_SECONDS),
      },
    );
  }

  async delete(bucket: BucketKind, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const { client } = this.require();
    await client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucketName(bucket),
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  /**
   * Every object (key and size) under this environment's prefix in a bucket. One Class A
   * operation per 1,000 objects, so only the weekly reconciliation uses it (§17.7).
   */
  async list(bucket: BucketKind): Promise<{ key: string; size: number }[]> {
    const { client, storage } = this.require();
    const objects: { key: string; size: number }[] = [];
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName(bucket),
          Prefix: storage.keyPrefix || undefined,
          ContinuationToken: token,
        }),
      );
      for (const item of page.Contents ?? []) {
        if (item.Key) objects.push({ key: item.Key, size: item.Size ?? 0 });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return objects;
  }

  /**
   * Bytes held across both buckets, from the `files` ledger (soft-deleted files still count until
   * purged). Spans every workspace because the free tier is per Cloudflare account — so SystemDb.
   */
  async usage(options: { fresh?: boolean } = {}): Promise<StorageUsage> {
    const { storage } = this.require();
    const cached = this.usageCache;
    if (!options.fresh && cached && Date.now() - cached.at < USAGE_CACHE_MS) {
      return {
        usedBytes: cached.value,
        budgetBytes: storage.budgetBytes,
        hardLimitBytes: storage.hardLimitBytes,
      };
    }
    const usedBytes = await this.systemDb.run(
      "storage: sum the files ledger for the budget",
      async (tx) => {
        const [row] = await tx
          .select({ total: sql<string>`coalesce(sum(${files.sizeBytes}), 0)` })
          .from(files)
          .where(isNull(files.purgedAt));
        return Number(row?.total ?? 0);
      },
    );
    this.usageCache = { value: usedBytes, at: Date.now() };
    return { usedBytes, budgetBytes: storage.budgetBytes, hardLimitBytes: storage.hardLimitBytes };
  }

  /** Records bytes just written so the next budget check sees them without waiting for the cache. */
  noteStored(bytes: number): void {
    if (this.usageCache)
      this.usageCache = { value: this.usageCache.value + bytes, at: this.usageCache.at };
  }

  /** Readiness: both buckets reachable, and usage under the soft budget (PROMPT §16.0 health). */
  async check(): Promise<DependencyCheck> {
    if (!this.storage || !this.client) return { status: "not_configured" };
    const startedAt = Date.now();
    try {
      const timeout = AbortSignal.timeout(3_000);
      await Promise.all(
        (["private", "public"] as const).map((bucket) => this.probe(bucket, timeout)),
      );
      const usage = await this.usage();
      if (usage.usedBytes >= usage.budgetBytes) {
        this.logger.warn(
          { usedBytes: usage.usedBytes, budgetBytes: usage.budgetBytes },
          "storage budget reached",
        );
        return { status: "degraded", latencyMs: Date.now() - startedAt };
      }
      return { status: "ok", latencyMs: Date.now() - startedAt };
    } catch (error) {
      this.logger.warn({ err: error }, "storage readiness check failed");
      return { status: "degraded" };
    }
  }

  private async probe(bucket: BucketKind, abortSignal: AbortSignal): Promise<void> {
    try {
      const found = await this.client?.send(
        new GetObjectCommand({ Bucket: this.bucketName(bucket), Key: this.key(PROBE_KEY) }),
        { abortSignal },
      );
      found?.Body?.transformToWebStream()
        .cancel()
        .catch(() => undefined);
    } catch (error) {
      if (error instanceof NoSuchKey) return;
      throw error;
    }
  }

  onModuleDestroy(): void {
    this.client?.destroy();
  }
}
