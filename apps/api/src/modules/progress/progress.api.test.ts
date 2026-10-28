import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { ClientProgressResponse, CreateInviteResponse, Metric } from "@fitcoach/shared";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";

let app: INestApplication;
let system: Pool;
const { client, signedInTrainer } = createHttpHelpers(
  () => app,
  () => system,
);
type SignedIn = Awaited<ReturnType<typeof signedInTrainer>>;

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
});

afterAll(async () => {
  await app.close();
  await system.end();
});

const ZONE = "Asia/Kolkata";
const day = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offset * 86_400_000),
  );

let counter = 0;
async function setUp() {
  const trainer = await signedInTrainer();
  const onboarded = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName: "Asha Rao",
      phone: `92${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`,
      primaryGoal: "lose_weight",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    })
    .set("Idempotency-Key", randomUUID());
  expect(onboarded.status, JSON.stringify(onboarded.body)).toBe(201);
  const clientId: string = onboarded.body.clientId;
  const types = (await trainer.http.get("/v1/measurement-types")).body.types as {
    id: string;
    key: string;
  }[];
  const typeId = (key: string) => types.find((type) => type.key === key)?.id ?? "";
  return { trainer, clientId, typeId };
}

async function signInClient(trainer: SignedIn, clientId: string) {
  const invite = (
    await trainer.http.post(`/v1/clients/${clientId}/portal/invite`, { channel: "whatsapp" })
  ).body as CreateInviteResponse;
  const phone = client();
  await phone.post("/v1/client-auth/invite/accept", {
    token: invite.link.split("/invite/")[1],
    acceptTerms: true,
  });
  return phone;
}

const metricOf = (body: { metrics: Metric[] }, key: string) =>
  body.metrics.find((metric) => metric.type.key === key);

describe("progress", () => {
  it("records weights in any unit as kg, summarizes change, and corrects by voiding", async () => {
    const { trainer, clientId, typeId } = await setUp();
    const add = (body: Record<string, unknown>) =>
      trainer.http.post(`/v1/clients/${clientId}/measurements`, body);
    expect(
      (
        await add({
          typeId: typeId("weight"),
          value: 80,
          unit: "kg",
          measuredOn: day(-60),
          note: "Morning",
        })
      ).status,
    ).toBe(201);
    expect(
      (await add({ typeId: typeId("weight"), value: 172, unit: "lb", measuredOn: day(-30) }))
        .status,
    ).toBe(201);
    const third = await add({
      typeId: typeId("weight"),
      value: 76,
      unit: "kg",
      measuredOn: day(0),
    });
    const weight = metricOf(third.body as ClientProgressResponse, "weight");
    expect(weight?.points.map((point) => point.value)).toEqual([80, 78.02, 76]);
    expect(weight).toMatchObject({
      first: { value: 80, measuredOn: day(-60) },
      latest: { value: 76, measuredOn: day(0) },
      change: -4,
      percentChange: -5,
      shared: false,
    });

    // Plausibility, units and dates.
    expect(
      (await add({ typeId: typeId("weight"), value: 2000, unit: "kg", measuredOn: day(0) })).status,
    ).toBe(400);
    expect(
      (await add({ typeId: typeId("weight"), value: 80, unit: "cm", measuredOn: day(0) })).status,
    ).toBe(400);
    expect(
      (await add({ typeId: typeId("weight"), value: 80, unit: "kg", measuredOn: day(2) })).status,
    ).toBe(400);
    const waist = await add({ typeId: typeId("waist"), value: 34, unit: "in", measuredOn: day(0) });
    expect(metricOf(waist.body, "waist")).toMatchObject({
      latest: { value: 86.36 },
      change: null,
      percentChange: null,
    });

    // A correction voids the value; it stays in history with the reason.
    const wrong = weight?.points[1]?.id ?? "";
    const voided = await trainer.http.post(`/v1/measurements/${wrong}/void`, { reason: "Typo" });
    expect(voided.status).toBe(200);
    const after = metricOf(voided.body, "weight");
    expect(after?.points.map((point) => point.value)).toEqual([80, 76]);
    expect(after?.voided).toMatchObject([{ id: wrong, value: 78.02, voidReason: "Typo" }]);
    expect(
      (await trainer.http.post(`/v1/measurements/${wrong}/void`, { reason: "Again" })).status,
    ).toBe(409);
  });

  it("adds custom measurement types to the workspace", async () => {
    const { trainer, clientId } = await setUp();
    const created = await trainer.http.post("/v1/measurement-types", {
      name: "Arm (left)",
      unitKind: "length",
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body).toMatchObject({ key: "arm_left", name: "Arm (left)", custom: true });
    expect(
      (await trainer.http.post("/v1/measurement-types", { name: "arm (LEFT)", unitKind: "length" }))
        .status,
    ).toBe(409);
    const added = await trainer.http.post(`/v1/clients/${clientId}/measurements`, {
      typeId: created.body.id,
      value: 32,
      unit: "cm",
      measuredOn: day(0),
    });
    expect(metricOf(added.body, "arm_left")?.latest?.value).toBe(32);
    const other = await signedInTrainer();
    const theirs = (await other.http.get("/v1/measurement-types")).body.types;
    expect(theirs.some((type: { id: string }) => type.id === created.body.id)).toBe(false);
  });

  it("shares weight only: the client sees weight but not waist, and adds their own when allowed", async () => {
    const { trainer, clientId, typeId } = await setUp();
    for (const [key, value, offset] of [
      ["weight", 80, -30],
      ["weight", 78, 0],
      ["waist", 90, 0],
    ] as const) {
      await trainer.http.post(`/v1/clients/${clientId}/measurements`, {
        typeId: typeId(key),
        value,
        unit: key === "weight" ? "kg" : "cm",
        measuredOn: day(offset),
        note: "Private trainer note",
      });
    }
    const phone = await signInClient(trainer, clientId);
    expect((await phone.get("/v1/client/progress")).body.metrics).toEqual([]);
    expect((await phone.get("/v1/client/home")).body.sharedMetrics).toEqual([]);

    const shared = await trainer.http.put(`/v1/clients/${clientId}/progress-sharing`, {
      typeIds: [typeId("weight")],
      selfLogging: false,
    });
    expect(metricOf(shared.body, "weight")?.shared).toBe(true);
    expect(metricOf(shared.body, "waist")?.shared).toBe(false);

    const progress = await phone.get("/v1/client/progress");
    expect(progress.body.metrics.map((metric: Metric) => metric.type.key)).toEqual(["weight"]);
    expect(progress.body.canLog).toBe(false);
    expect(JSON.stringify(progress.body)).not.toMatch(/Private trainer note|"waist"/);
    expect((await phone.get("/v1/client/home")).body.sharedMetrics).toEqual([
      { name: "Weight", unitKind: "mass", latest: 78, change: -2, since: day(-30) },
    ]);

    const own = { typeId: typeId("weight"), value: 77.5, unit: "kg", measuredOn: day(0) };
    expect((await phone.post("/v1/client/measurements", own)).status).toBe(403);
    await trainer.http.put(`/v1/clients/${clientId}/progress-sharing`, {
      typeIds: [typeId("weight")],
      selfLogging: true,
    });
    const logged = await phone.post("/v1/client/measurements", own);
    expect(logged.status, JSON.stringify(logged.body)).toBe(201);
    expect(logged.body.metrics[0].points.at(-1)).toMatchObject({ value: 77.5, source: "client" });
    expect(
      (await phone.post("/v1/client/measurements", { ...own, typeId: typeId("waist") })).status,
    ).toBe(400);

    // Overview: this client's own change; no averages across clients.
    const overview = await trainer.http.get("/v1/progress");
    const row = overview.body.clients.find((entry: { id: string }) => entry.id === clientId);
    expect(row.changes[0]).toMatchObject({ name: "Weight", change: -2.5 });
  });

  it("keeps progress to the workspace and the client (tampering)", async () => {
    const { trainer, clientId, typeId } = await setUp();
    const added = await trainer.http.post(`/v1/clients/${clientId}/measurements`, {
      typeId: typeId("weight"),
      value: 80,
      unit: "kg",
      measuredOn: day(0),
    });
    const id = metricOf(added.body, "weight")?.points[0]?.id ?? "";
    const other = await signedInTrainer();
    expect((await other.http.get(`/v1/clients/${clientId}/progress`)).status).toBe(404);
    expect(
      (
        await other.http.post(`/v1/clients/${clientId}/measurements`, {
          typeId: typeId("weight"),
          value: 70,
          unit: "kg",
          measuredOn: day(0),
        })
      ).status,
    ).toBe(404);
    expect((await other.http.post(`/v1/measurements/${id}/void`, { reason: "x" })).status).toBe(
      404,
    );
    expect(
      (
        await other.http.put(`/v1/clients/${clientId}/progress-sharing`, {
          typeIds: [],
          selfLogging: true,
        })
      ).status,
    ).toBe(404);
    expect((await other.http.get("/v1/progress")).body.clients).toEqual([]);
    const phone = await signInClient(trainer, clientId);
    expect((await phone.get(`/v1/clients/${clientId}/progress`)).status).toBe(403);
    expect(
      (
        await phone.put(`/v1/clients/${clientId}/progress-sharing`, {
          typeIds: [typeId("weight")],
          selfLogging: true,
        })
      ).status,
    ).toBe(403);
    expect((await trainer.http.get("/v1/client/progress")).status).toBe(403);
  });
});
