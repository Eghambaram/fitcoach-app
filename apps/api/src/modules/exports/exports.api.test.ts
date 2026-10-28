import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { CreateInviteResponse, DataExport, DataExportListResponse } from "@fitcoach/shared";
import type { Pool } from "pg";
import type { Response } from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { StorageService } from "../../integrations/storage/storage.service";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";
import { unzip } from "../../test/unzip";
import { ExportsService } from "./exports.service";

let app: INestApplication;
let system: Pool;
let owner: Pool;
const { client, signedInTrainer } = createHttpHelpers(
  () => app,
  () => system,
);
type SignedIn = Awaited<ReturnType<typeof signedInTrainer>>;

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
  owner = createPool(inject("db").ownerUrl);
});

afterAll(async () => {
  await app.close();
  await Promise.all([system.end(), owner.end()]);
});

let counter = 0;
const phone = () => `94${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`;

async function workspaceId(trainer: SignedIn): Promise<string> {
  return (await trainer.http.get("/v1/auth/me")).body.workspace.id;
}

/** Supertest buffers a zip into a Buffer only when told how. */
const binary = (response: Response, callback: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(chunk));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
};

async function requestAndBuild(trainer: SignedIn): Promise<DataExport> {
  const requested = await trainer.http.post("/v1/exports");
  expect(requested.status, JSON.stringify(requested.body)).toBe(201);
  expect(requested.body.status).toBe("pending");
  // The queued job may also run. Only one run builds it (row lock); if the job has it, wait for it.
  await app.get(ExportsService).generate(requested.body.id);
  let built: DataExport | undefined;
  for (let attempt = 0; attempt < 50; attempt++) {
    const list = (await trainer.http.get("/v1/exports")).body as DataExportListResponse;
    built = list.exports.find((item) => item.id === requested.body.id);
    if (built?.status !== "pending") break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  expect(built?.status).toBe("ready");
  return built as DataExport;
}

describe("data export", () => {
  it("builds a zip of the workspace's CSVs, downloadable only by that workspace", async () => {
    const trainer = await signedInTrainer();
    const lead = await trainer.http.post("/v1/leads", {
      fullName: "Meena Singh",
      phone: phone(),
      goal: "lose_weight",
      source: "instagram",
      campaign: "=SUM(A1)",
    });
    expect(lead.status, JSON.stringify(lead.body)).toBe(201);
    const onboarded = await trainer.http
      .post("/v1/onboarding/finalize", {
        fullName: "Asha Rao",
        phone: phone(),
        primaryGoal: "build_muscle",
        trainingMode: "in_person",
        consentDataProcessing: true,
        units: { weightUnit: "kg", lengthUnit: "cm" },
      })
      .set("Idempotency-Key", randomUUID());
    expect(onboarded.status).toBe(201);

    const empty = (await trainer.http.get("/v1/exports")).body as DataExportListResponse;
    expect(empty).toEqual({ available: true, exports: [] });

    const built = await requestAndBuild(trainer);
    expect(built.sizeBytes).toBeGreaterThan(0);
    expect(built.expiresAt).not.toBeNull();

    const download = await trainer.http
      .get(`/v1/exports/${built.id}/download`)
      .buffer(true)
      .parse(binary);
    expect(download.status).toBe(200);
    expect(download.headers["content-type"]).toContain("application/zip");
    expect(download.headers["content-disposition"]).toMatch(
      /attachment; filename="fitcoach-export-\d{4}-\d{2}-\d{2}\.zip"/,
    );
    const files = unzip(download.body as Buffer);
    expect(Object.keys(files).sort()).toEqual(
      [
        "appointments.csv",
        "clients.csv",
        "leads.csv",
        "measurements.csv",
        "packages.csv",
        "payments.csv",
      ].sort(),
    );
    expect(files["leads.csv"]).toContain('"Meena Singh"');
    // Formula-looking text is neutralised (CSV injection).
    expect(files["leads.csv"]).toContain(`"'=SUM(A1)"`);
    expect(files["clients.csv"]).toContain('"Asha Rao"');
    expect(files["payments.csv"]?.startsWith("﻿")).toBe(true);

    const events = await system.query<{ count: number }>(
      "select count(*)::int as count from product_events where event = 'data_exported' and workspace_id = $1",
      [await workspaceId(trainer)],
    );
    expect(events.rows[0]?.count).toBe(1);

    // Tampering: another trainer can neither list nor download it, even with the id.
    const other = await signedInTrainer();
    expect((await other.http.get("/v1/exports")).body.exports).toEqual([]);
    expect((await other.http.get(`/v1/exports/${built.id}/download`)).status).toBe(404);
    expect((await client().get(`/v1/exports/${built.id}/download`)).status).toBe(401);
  });

  it("allows one pending export at a time", async () => {
    const trainer = await signedInTrainer();
    const first = await trainer.http.post("/v1/exports");
    expect(first.status).toBe(201);
    const second = await trainer.http.post("/v1/exports");
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("CONFLICT_STATE");
    const pending = await trainer.http.get(`/v1/exports/${first.body.id}/download`);
    expect(pending.status).toBe(409);
  });

  it("expires exports after their window and deletes the file", async () => {
    const trainer = await signedInTrainer();
    const built = await requestAndBuild(trainer);
    const { rows } = await system.query<{ object_key: string }>(
      "select object_key from data_exports where id = $1",
      [built.id],
    );
    await owner.query(
      "update data_exports set expires_at = now() - interval '1 minute' where id = $1",
      [built.id],
    );
    expect((await trainer.http.get(`/v1/exports/${built.id}/download`)).status).toBe(409);
    expect(await app.get(ExportsService).expire()).toBeGreaterThanOrEqual(1);
    const list = (await trainer.http.get("/v1/exports")).body as DataExportListResponse;
    expect(list.exports[0]?.status).toBe("expired");
    await expect(app.get(StorageService).getPrivate(rows[0]?.object_key ?? "")).rejects.toThrow();
  });

  it("is for trainers only, and still works when the workspace is suspended", async () => {
    const trainer = await signedInTrainer();
    const onboarded = await trainer.http
      .post("/v1/onboarding/finalize", {
        fullName: "Ravi Kumar",
        phone: phone(),
        primaryGoal: "build_muscle",
        trainingMode: "in_person",
        consentDataProcessing: true,
        units: { weightUnit: "kg", lengthUnit: "cm" },
      })
      .set("Idempotency-Key", randomUUID());
    const invite = (
      await trainer.http.post(`/v1/clients/${onboarded.body.clientId}/portal/invite`, {
        channel: "whatsapp",
      })
    ).body as CreateInviteResponse;
    const portal = client();
    expect(
      (
        await portal.post("/v1/client-auth/invite/accept", {
          token: invite.link.split("/invite/")[1],
          acceptTerms: true,
        })
      ).status,
    ).toBe(200);
    expect((await portal.get("/v1/exports")).status).toBe(403);
    expect((await portal.post("/v1/exports")).status).toBe(403);
    expect((await portal.post("/v1/feedback", { message: "Hello there" })).status).toBe(403);

    await owner.query("update workspaces set status = 'suspended' where id = $1", [
      await workspaceId(trainer),
    ]);
    expect((await trainer.http.post("/v1/exports")).status).toBe(201);
    expect(
      (await trainer.http.post("/v1/feedback", { message: "Why am I suspended?" })).status,
    ).toBe(201);
  });
});

describe("feedback", () => {
  it("stores the message with the page it came from, and records the event", async () => {
    const trainer = await signedInTrainer();
    const sent = await trainer.http.post("/v1/feedback", {
      message: "  The calendar should start on Monday  ",
      page: "/app/calendar",
    });
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    const { rows } = await system.query<{ message: string; page: string; status: string }>(
      "select message, page, status from feedback where id = $1",
      [sent.body.id],
    );
    expect(rows[0]).toEqual({
      message: "The calendar should start on Monday",
      page: "/app/calendar",
      status: "open",
    });
    const events = await system.query<{ properties: Record<string, unknown> }>(
      "select properties from product_events where event = 'feedback_sent' and user_id = (select user_id from feedback where id = $1)",
      [sent.body.id],
    );
    // No message text in the event (no free text in analytics).
    expect(events.rows).toEqual([{ properties: {} }]);
  });

  it("rejects short messages and pages that aren't app paths, and rate-limits", async () => {
    const trainer = await signedInTrainer();
    const short = await trainer.http.post("/v1/feedback", { message: "hi" });
    expect(short.status).toBe(400);
    expect(short.body.fieldErrors?.message).toBeDefined();
    const url = await trainer.http.post("/v1/feedback", {
      message: "Hello there",
      page: "https://evil.example/x",
    });
    expect(url.status).toBe(400);
    expect(url.body.fieldErrors?.page).toBeDefined();

    for (let index = 0; index < 10; index++) {
      expect((await trainer.http.post("/v1/feedback", { message: `Idea ${index}` })).status).toBe(
        201,
      );
    }
    expect((await trainer.http.post("/v1/feedback", { message: "One more idea" })).status).toBe(
      429,
    );
  });
});
