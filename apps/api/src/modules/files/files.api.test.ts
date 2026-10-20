import type { INestApplication } from "@nestjs/common";
import { MAX_UPLOAD_BYTES, uploadedPhotoResponseSchema } from "@fitcoach/shared";
import type { Pool } from "pg";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { PinoLogger } from "nestjs-pino";
import { AppConfig } from "../../config/env";
import { SystemDb } from "../../db/system-db";
import { StorageService } from "../../integrations/storage/storage.service";
import { createTestApp, WEB_HEADERS } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";
import { FilesService } from "./files.service";

let app: INestApplication;
let system: Pool;
let owner: Pool;
const { signedInTrainer } = createHttpHelpers(
  () => app,
  () => system,
);

/** A phone-like JPEG carrying EXIF (camera + GPS) that must not survive. */
function jpegWithExif(width = 2000, height = 1500) {
  return sharp({ create: { width, height, channels: 3, background: "#c8f169" } })
    .jpeg()
    .withExif({ IFD0: { Make: "Phone", Copyright: "private" }, IFD3: { GPSLatitudeRef: "N" } })
    .toBuffer();
}

/** Anonymous GET straight from the bucket — what a browser does with a public URL. */
async function fetchPublic(url: string) {
  const response = await fetch(url);
  return {
    status: response.status,
    type: response.headers.get("content-type"),
    body: Buffer.from(await response.arrayBuffer()),
  };
}

async function fileRow(objectKeyLike: string) {
  const { rows } = await owner.query<{
    id: string;
    kind: string;
    bucket: string;
    size_bytes: string;
    deleted_at: Date | null;
  }>("select id, kind, bucket, size_bytes, deleted_at from files where object_key = $1", [
    objectKeyLike,
  ]);
  return rows[0];
}

function keyFrom(url: string): string {
  const { publicBucket } = inject("storage");
  return decodeURIComponent(new URL(url).pathname.replace(`/${publicBucket}/`, ""));
}

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
  owner = createPool(inject("db").ownerUrl);
});

afterAll(async () => {
  await app.close();
  await Promise.all([system.end(), owner.end()]);
});

describe("profile photo upload (step 1.5 Done when)", () => {
  it("stores a WebP without EXIF in the public bucket and shows it on /me", async () => {
    const { http } = await signedInTrainer();

    const response = await http.upload("/v1/files/profile-photo", await jpegWithExif());

    expect(response.status).toBe(200);
    const photo = uploadedPhotoResponseSchema.parse(response.body);

    const stored = await fetchPublic(photo.url);
    expect(stored.status).toBe(200);
    expect(stored.type).toBe("image/webp");
    const metadata = await sharp(stored.body).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(512);

    const thumbnail = await sharp((await fetchPublic(photo.thumbnailUrl)).body).metadata();
    expect(thumbnail.width).toBe(128);

    const row = await fileRow(keyFrom(photo.url));
    expect(row).toMatchObject({ kind: "trainer_avatar", bucket: "public", deleted_at: null });
    expect(Number(row?.size_bytes)).toBeGreaterThan(stored.body.length);

    expect((await http.get("/v1/auth/me")).body.profile.avatarUrl).toBe(photo.url);
  });

  it("replaces the old photo (soft-deleted, purged later) and can remove it", async () => {
    const { http } = await signedInTrainer();
    const first = uploadedPhotoResponseSchema.parse(
      (await http.upload("/v1/files/profile-photo", await jpegWithExif())).body,
    );
    const second = uploadedPhotoResponseSchema.parse(
      (await http.upload("/v1/files/profile-photo", await jpegWithExif(800, 800))).body,
    );

    expect((await fileRow(keyFrom(first.url)))?.deleted_at).not.toBeNull();
    expect((await http.get("/v1/auth/me")).body.profile.avatarUrl).toBe(second.url);

    expect((await http.delete("/v1/files/profile-photo")).status).toBe(200);
    expect((await http.get("/v1/auth/me")).body.profile.avatarUrl).toBeNull();
    expect((await fileRow(keyFrom(second.url)))?.deleted_at).not.toBeNull();
  });
});

describe("refusals with readable messages", () => {
  it("refuses files over 10 MB", async () => {
    const { http } = await signedInTrainer();

    const response = await http.upload(
      "/v1/files/profile-photo",
      Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 1),
    );

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      message: "That file is too large. Photos can be up to 10 MB.",
    });
  });

  it.each([
    ["an SVG named .jpg", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "photo.jpg"],
    ["a text file", Buffer.from("not an image"), "notes.png"],
  ])("refuses %s by its real content", async (_label, body, filename) => {
    const { http } = await signedInTrainer();

    const response = await http.upload("/v1/files/profile-photo", body, filename);

    expect(response.status).toBe(415);
    expect(response.body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
    expect(response.body.fieldErrors).toHaveProperty("file");
  });

  it("asks for a file when none is sent", async () => {
    const { http } = await signedInTrainer();

    const response = await http.post("/v1/files/profile-photo");

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toHaveProperty("file");
  });

  it("refuses uploads once the storage hard limit is reached (§17.7)", async () => {
    const { http } = await signedInTrainer();
    const storage = app.get(StorageService);
    const { rows } = await owner.query<{ id: string }>(
      `insert into files (kind, bucket, object_key, mime_type, size_bytes, width, height, checksum)
       values ('trainer_avatar', 'public', $1, 'image/webp', $2, 1, 1, 'x') returning id`,
      [`ledger-test/${Date.now()}.webp`, 9 * 1024 ** 3],
    );
    try {
      await storage.usage({ fresh: true });

      const response = await http.upload("/v1/files/profile-photo", await jpegWithExif());

      expect(response.status).toBe(507);
      expect(response.body).toMatchObject({ code: "STORAGE_FULL" });
      expect(response.body.message).toMatch(/storage is full/);

      const ready = await request(app.getHttpServer()).get("/v1/health/ready");
      expect(ready.body.checks.storage.status).toBe("degraded");
    } finally {
      await owner.query("delete from files where id = $1", [rows[0]?.id]);
      await storage.usage({ fresh: true });
    }
  });

  it("requires a signed-in trainer and the CSRF header", async () => {
    const image = await jpegWithExif(100, 100);

    const anonymous = await request(app.getHttpServer())
      .post("/v1/files/profile-photo")
      .set(WEB_HEADERS)
      .attach("file", image, "a.jpg");
    const { http } = await signedInTrainer();
    const noCsrf = await http.agent
      .post("/v1/files/profile-photo")
      .set("origin", WEB_HEADERS.origin)
      .attach("file", image, "a.jpg");

    expect(anonymous.status).toBe(401);
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.code).toBe("CSRF_REJECTED");
  });
});

describe("storage service", () => {
  it("reports both buckets reachable in readiness", async () => {
    const ready = await request(app.getHttpServer()).get("/v1/health/ready");

    expect(ready.body.checks.storage.status).toBe("ok");
  });

  it("reports a misspelled bucket as degraded, not ok", async () => {
    const config = app.get(AppConfig);
    if (!config.storage) throw new Error("storage must be configured in the API suite");
    const misconfigured = new StorageService(
      { ...config, storage: { ...config.storage, publicBucket: "fitcoach-test-missing" } },
      app.get(SystemDb),
      await app.resolve(PinoLogger),
    );
    try {
      expect((await misconfigured.check()).status).toBe("degraded");
    } finally {
      misconfigured.onModuleDestroy();
    }
  });

  it("serves private objects only through presigned URLs that expire within 5 minutes", async () => {
    const storage = app.get(StorageService);
    const key = storage.key(`client-avatars/test/${Date.now()}.webp`);
    await storage.put(
      "private",
      key,
      await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } })
        .webp()
        .toBuffer(),
      "image/webp",
    );

    const { endpoint, privateBucket } = inject("storage");
    const unsigned = await fetch(`${endpoint}/${privateBucket}/${key}`);
    const signedUrl = await storage.presignGet(key, 3_600);
    const signed = await fetch(signedUrl);

    expect(unsigned.status).toBe(403);
    expect(signed.status).toBe(200);
    expect(new URL(signedUrl).searchParams.get("X-Amz-Expires")).toBe("300");
    await storage.delete("private", [key]);
  });

  it("purges objects soft-deleted more than 7 days ago and keeps the ledger row", async () => {
    const { http } = await signedInTrainer();
    const photo = uploadedPhotoResponseSchema.parse(
      (await http.upload("/v1/files/profile-photo", await jpegWithExif())).body,
    );
    await http.delete("/v1/files/profile-photo");
    const key = keyFrom(photo.url);
    await owner.query(
      "update files set deleted_at = now() - interval '8 days' where object_key = $1",
      [key],
    );

    const purged = await app.get(FilesService).purgeDeleted();

    expect(purged).toBeGreaterThanOrEqual(1);
    expect((await fetchPublic(photo.url)).status).toBe(404);
    const { rows } = await owner.query("select purged_at from files where object_key = $1", [key]);
    expect(rows[0]?.purged_at).not.toBeNull();
  });
});
