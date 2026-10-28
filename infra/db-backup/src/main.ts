/**
 * Nightly logical backup (PROMPT §17.2, §17.5, ADR-0063), run by Railway cron in the `db-backup`
 * service: pg_dump -Fc → check it with pg_restore --list → upload to the private R2 bucket under
 * backups/daily/ (and backups/weekly/ on Sundays) → delete copies past retention → heartbeat to
 * the API. Any failure still sends a heartbeat (status failed) and exits non-zero.
 */
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { backupKeys, expiredKeys, safeError } from "./plan";

interface Env {
  databaseUrl: string;
  storage: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    keyPrefix: string;
  };
  apiUrl: string | null;
  heartbeatToken: string | null;
  timeZone: string;
}

function readEnv(): Env {
  const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
  };
  return {
    // The admin URL (`${{Postgres.DATABASE_URL}}`): pg_dump must read every table, past RLS.
    databaseUrl: required("DATABASE_URL"),
    storage: {
      endpoint: required("STORAGE_ENDPOINT"),
      region: process.env.STORAGE_REGION ?? "auto",
      accessKeyId: required("STORAGE_ACCESS_KEY_ID"),
      secretAccessKey: required("STORAGE_SECRET_ACCESS_KEY"),
      bucket: required("STORAGE_PRIVATE_BUCKET"),
      keyPrefix: process.env.STORAGE_KEY_PREFIX ?? "",
    },
    apiUrl: process.env.API_INTERNAL_URL ?? null,
    heartbeatToken: process.env.BACKUP_HEARTBEAT_TOKEN ?? null,
    timeZone: process.env.BACKUP_TIMEZONE ?? "Asia/Kolkata",
  };
}

/** One JSON line per step (Railway log search); never URLs, keys or tokens. */
function log(message: string, fields: Record<string, unknown> = {}): void {
  process.stdout.write(
    `${JSON.stringify({ time: new Date().toISOString(), msg: message, ...fields })}\n`,
  );
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // stdout is ignored (pg_restore --list prints the table of contents); stderr is kept short.
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

async function listKeys(client: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const item of page.Contents ?? []) if (item.Key) keys.push(item.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function heartbeat(env: Env, body: Record<string, unknown>): Promise<void> {
  if (!env.apiUrl || !env.heartbeatToken) {
    log("heartbeat skipped: API_INTERNAL_URL or BACKUP_HEARTBEAT_TOKEN not set");
    return;
  }
  const response = await fetch(`${env.apiUrl.replace(/\/+$/, "")}/v1/internal/backups/heartbeat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.heartbeatToken}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`heartbeat answered ${response.status}`);
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const env = readEnv();
  const keys = backupKeys(startedAt, env.timeZone, env.storage.keyPrefix);
  const file = join(tmpdir(), `fitcoach-${keys.date}.dump`);
  const client = new S3Client({
    endpoint: env.storage.endpoint,
    region: env.storage.region,
    credentials: {
      accessKeyId: env.storage.accessKeyId,
      secretAccessKey: env.storage.secretAccessKey,
    },
    forcePathStyle: true,
    // R2 rejects some default checksum headers of newer SDKs (CLAUDE.md gotchas).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  try {
    log("dump started", { date: keys.date });
    await run("pg_dump", ["--format=custom", "--compress=9", `--file=${file}`, env.databaseUrl]);
    // A dump that pg_restore can't read is worse than none: check before uploading.
    await run("pg_restore", ["--list", file]);
    const { size } = await stat(file);
    log("dump ready", { sizeBytes: size });

    await client.send(
      new PutObjectCommand({
        Bucket: env.storage.bucket,
        Key: keys.daily,
        Body: createReadStream(file),
        ContentLength: size,
        ContentType: "application/octet-stream",
      }),
    );
    if (keys.weekly) {
      await client.send(
        new CopyObjectCommand({
          Bucket: env.storage.bucket,
          Key: keys.weekly,
          CopySource: `${env.storage.bucket}/${keys.daily}`,
        }),
      );
    }
    log("uploaded", { key: keys.daily, weekly: keys.weekly !== null });

    const stored = await listKeys(client, env.storage.bucket, `${env.storage.keyPrefix}backups/`);
    const expired = expiredKeys(stored, keys.date);
    if (expired.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: env.storage.bucket,
          Delete: { Objects: expired.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
    log("retention applied", { deleted: expired.length });

    await heartbeat(env, {
      status: "succeeded",
      objectKey: keys.daily,
      sizeBytes: size,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    });
    log("backup succeeded");
  } catch (error) {
    const message = safeError(error);
    log("backup failed", { error: message });
    await heartbeat(env, {
      status: "failed",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      error: message,
    }).catch((failure: unknown) =>
      log("failure heartbeat not delivered", { error: safeError(failure) }),
    );
    process.exitCode = 1;
  } finally {
    await rm(file, { force: true });
  }
}

void main();
