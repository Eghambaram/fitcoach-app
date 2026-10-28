import type { INestApplication } from "@nestjs/common";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { BackupsService } from "./backups.service";

const TOKEN = "test-backup-heartbeat-token-0123456789";

let app: INestApplication;
let owner: Pool;
let system: Pool;

beforeAll(async () => {
  app = await createTestApp();
  owner = createPool(inject("db").ownerUrl);
  system = createPool(inject("db").systemUrl);
});

afterAll(async () => {
  await app.close();
  await Promise.all([owner.end(), system.end()]);
});

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/** The db-backup cron: no browser, no Origin, a bearer token over the private network. */
const heartbeat = (body: object, token: string | null = TOKEN) => {
  const call = request(app.getHttpServer())
    .post("/v1/internal/backups/heartbeat")
    .set(
      "x-forwarded-for",
      `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
    );
  return (token === null ? call : call.set("authorization", `Bearer ${token}`)).send(body);
};

describe("backup heartbeat", () => {
  it("records good and failed runs and drives the Backups health check", async () => {
    await owner.query("delete from backup_runs");
    const backups = app.get(BackupsService);
    expect((await backups.health()).status).toBe("unknown");

    const ok = await heartbeat({
      status: "succeeded",
      objectKey: "backups/daily/2026-10-28.dump",
      sizeBytes: 2_400_000,
      startedAt: hoursAgo(2),
      finishedAt: hoursAgo(1.9),
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const good = await backups.health();
    expect(good.status).toBe("ok");
    expect(good.detail).toContain("2.3 MB");

    await heartbeat({
      status: "failed",
      startedAt: hoursAgo(0.2),
      finishedAt: hoursAgo(0.1),
      error: "pg_dump exited with code 1",
    });
    const failed = await backups.health();
    expect(failed.status).toBe("degraded");
    expect(failed.detail).toContain("pg_dump exited with code 1");

    // A good run older than 26 hours is stale, even when it was the last one.
    await owner.query("delete from backup_runs");
    await heartbeat({
      status: "succeeded",
      objectKey: "backups/weekly/2026-10-25.dump",
      sizeBytes: 1_000,
      startedAt: hoursAgo(30),
      finishedAt: hoursAgo(29.9),
    });
    expect((await backups.health()).status).toBe("degraded");
  });

  it("needs the token, a backups/ key and a size for a success", async () => {
    const body = {
      status: "succeeded",
      objectKey: "backups/daily/2026-10-28.dump",
      sizeBytes: 10,
      startedAt: hoursAgo(1),
      finishedAt: hoursAgo(0.9),
    };
    expect((await heartbeat(body, null)).status).toBe(401);
    expect((await heartbeat(body, "wrong-token-0123456789-0123456789")).status).toBe(401);
    expect((await heartbeat({ ...body, objectKey: "exports/x.zip" })).status).toBe(400);
    const missing = await heartbeat({ ...body, sizeBytes: undefined });
    expect(missing.status).toBe(400);
    expect(missing.body.fieldErrors.objectKey).toBeDefined();
  });

  it("is append-only and invisible to the request role", async () => {
    expect(await owner.query("select 1 from backup_runs limit 1")).toBeDefined();
    await expect(system.query("update backup_runs set status = 'failed'")).rejects.toThrow(
      /permission denied/,
    );
    await expect(system.query("delete from backup_runs")).rejects.toThrow(/permission denied/);
    const appPool = createPool(inject("db").appUrl);
    try {
      await expect(appPool.query("select 1 from backup_runs")).rejects.toThrow(/permission denied/);
    } finally {
      await appPool.end();
    }
  });
});

describe("production configuration", () => {
  it("doesn't serve the OpenAPI docs in production", async () => {
    const saved = { ...process.env };
    Object.assign(process.env, {
      APP_ENV: "production",
      WEB_ORIGIN: "https://app.example.com",
      IP_HASH_SALT: "production-test-ip-hash-salt-0123456789",
      EMAIL_PROVIDER: "smtp",
      SMTP_URL: "smtp://localhost:1025",
      STORAGE_PUBLIC_BASE_URL: "https://media.example.com",
    });
    let production: INestApplication | undefined;
    try {
      production = await createTestApp();
      expect((await request(production.getHttpServer()).get("/v1/docs")).status).toBe(404);
      expect((await request(production.getHttpServer()).get("/v1/health")).status).toBe(200);
    } finally {
      await production?.close();
      process.env = saved;
    }
    // Outside production they are served.
    expect((await request(app.getHttpServer()).get("/v1/docs")).status).toBe(200);
  });
});
