import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";

let app: INestApplication;
let system: Pool;
let owner: Pool;
const { signedInTrainer } = createHttpHelpers(
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

const ZONE = "Asia/Kolkata";
const day = (offset: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offset * 86_400_000),
  );

let counter = 0;
const uniquePhone = () =>
  `91${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`;

async function newClient(trainer: SignedIn, fields: Record<string, unknown> = {}): Promise<string> {
  const response = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName: "Asha Rao",
      phone: uniquePhone(),
      primaryGoal: "build_muscle",
      secondaryGoals: ["get_stronger"],
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
      ...fields,
    })
    .set("Idempotency-Key", randomUUID());
  expect(response.status).toBe(201);
  return response.body.clientId;
}

async function workspaceOf(trainer: SignedIn): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    "select w.id from workspaces w join users u on u.id = w.owner_user_id where u.email = $1",
    [trainer.email],
  );
  return rows[0]?.id ?? "";
}

describe("clients list", () => {
  it("puts clients in their status tabs with counts, searches, filters and pages", async () => {
    const trainer = await signedInTrainer();
    const asha = await newClient(trainer, { fullName: "Asha Rao" });
    await newClient(trainer, { fullName: "Bhavna Iyer", trainingMode: "online" });
    const ravi = await newClient(trainer, { fullName: "Ravi Kumar", primaryGoal: "lose_weight" });
    await trainer.http.post(`/v1/clients/${ravi}/status`, { action: "pause" });
    const booked = await trainer.http.post("/v1/appointments", {
      clientId: asha,
      kind: "session",
      date: day(2),
      startTime: "07:00",
      durationMin: 60,
    });
    expect(booked.status, JSON.stringify(booked.body)).toBe(201);

    const active = await trainer.http.get("/v1/clients");
    expect(active.body.counts).toEqual({ onboarding_draft: 0, active: 2, paused: 1, archived: 0 });
    expect(active.body.items.map((c: { fullName: string }) => c.fullName)).toEqual([
      "Asha Rao",
      "Bhavna Iyer",
    ]);
    expect(active.body.items[0].nextSession).toEqual({ date: day(2), startTime: "07:00" });
    expect(active.body.items[1].nextSession).toBeNull();

    const paused = await trainer.http.get("/v1/clients?status=paused");
    expect(paused.body.items.map((c: { fullName: string }) => c.fullName)).toEqual(["Ravi Kumar"]);

    const names = async (query: string) =>
      (await trainer.http.get(`/v1/clients?${query}`)).body.items.map(
        (c: { fullName: string }) => c.fullName,
      );
    expect(await names("q=bhav")).toEqual(["Bhavna Iyer"]);
    expect(await names("mode=online")).toEqual(["Bhavna Iyer"]);
    expect(await names("status=paused&goal=lose_weight")).toEqual(["Ravi Kumar"]);
    expect((await trainer.http.get("/v1/clients?q=bhav")).body.counts.active).toBe(1);

    const first = await trainer.http.get("/v1/clients?limit=1");
    const second = await trainer.http.get(
      `/v1/clients?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    );
    expect(second.body.items.map((c: { fullName: string }) => c.fullName)).toEqual(["Bhavna Iyer"]);
    expect((await trainer.http.get("/v1/clients?cursor=nope")).status).toBe(400);
  });
});

describe("client detail", () => {
  it("shows goals, consents, latest measurements, stats, activity and notes from real data", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer, {
      weight: 72.5,
      height: 170,
      measuredOn: day(-7),
      limitations: "Old knee injury",
      emergencyContactName: "Ravi",
      emergencyContactPhone: "98765 43210",
      coachingStartOn: day(-15),
    });
    // A second weight, so the weight has a trend (≥ 2 points).
    const { rows } = await owner.query<{ id: string }>(
      "select id from measurement_types where workspace_id is null and key = 'weight'",
    );
    await owner.query(
      `insert into measurements (workspace_id, client_id, type_id, value, measured_on, source, recorded_by_user_id)
       select workspace_id, id, $2, 71.8, current_date, 'trainer', created_by_user_id from clients where id = $1`,
      [clientId, rows[0]?.id],
    );
    const past = (
      await trainer.http.post("/v1/appointments", {
        clientId,
        kind: "session",
        date: day(-1),
        startTime: "09:00",
        durationMin: 60,
      })
    ).body;
    await trainer.http.post(`/v1/appointments/${past.id}/attendance`, { status: "completed" });
    await trainer.http.post("/v1/appointments", {
      clientId,
      kind: "session",
      date: day(3),
      startTime: "08:00",
      durationMin: 45,
    });
    await trainer.http.post(`/v1/clients/${clientId}/notes`, { body: "Prefers free weights" });

    const detail = (await trainer.http.get(`/v1/clients/${clientId}`)).body;
    expect(detail).toMatchObject({
      fullName: "Asha Rao",
      status: "active",
      limitations: "Old knee injury",
      emergencyContact: { name: "Ravi", phone: "+919876543210", relation: null },
      goals: [
        { kind: "primary", goal: "build_muscle" },
        { kind: "secondary", goal: "get_stronger" },
      ],
      consents: [
        { kind: "data_processing", status: "granted", noticeVersion: 1 },
        { kind: "progress_photos", status: "declined", noticeVersion: 1 },
      ],
      stats: {
        weeksWithYou: 2,
        sessionsCompleted: 1,
        nextAppointment: { date: day(3), startTime: "08:00", kind: "session" },
      },
      units: { weightUnit: "kg", lengthUnit: "cm" },
      onboardingLink: null,
      notes: [expect.objectContaining({ body: "Prefers free weights" })],
    });
    expect(detail.measurements).toEqual([
      {
        key: "weight",
        name: "Weight",
        unitKind: "mass",
        value: 71.8,
        measuredOn: day(0),
        points: 2,
      },
      {
        key: "height",
        name: "Height",
        unitKind: "length",
        value: 170,
        measuredOn: day(-7),
        points: 1,
      },
    ]);
    expect(detail.recentActivity.map((entry: { type: string }) => entry.type)).toEqual(
      expect.arrayContaining(["session_attended", "client_onboarded"]),
    );

    const schedule = (await trainer.http.get(`/v1/clients/${clientId}/schedule`)).body;
    expect(schedule.upcoming).toHaveLength(1);
    expect(schedule.past.map((a: { status: string }) => a.status)).toEqual(["completed"]);
  });

  it("links a converted lead's client back to onboarding until it's finished", async () => {
    const trainer = await signedInTrainer();
    const lead = (
      await trainer.http.post("/v1/leads", {
        fullName: "Kiran",
        phone: uniquePhone(),
        goal: "other",
        source: "other",
      })
    ).body;
    const { clientId } = (
      await trainer.http
        .post(`/v1/leads/${lead.id}/convert`, {})
        .set("Idempotency-Key", randomUUID())
    ).body;
    const detail = (await trainer.http.get(`/v1/clients/${clientId}`)).body;
    expect(detail).toMatchObject({
      status: "onboarding_draft",
      onboardingLink: `/app/clients/new?fromLead=${lead.id}`,
      sourceLeadId: lead.id,
      stats: { weeksWithYou: null },
    });
    expect((await trainer.http.get("/v1/clients?status=onboarding_draft")).body.items).toHaveLength(
      1,
    );
  });
});

describe("lifecycle", () => {
  it("pauses, resumes, archives (cancelling future sessions) and restores with history kept", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const future = (
      await trainer.http.post("/v1/appointments", {
        clientId,
        kind: "session",
        date: day(4),
        startTime: "07:00",
        durationMin: 60,
      })
    ).body;
    await trainer.http.post(`/v1/clients/${clientId}/notes`, { body: "Kept forever" });

    expect(
      (await trainer.http.post(`/v1/clients/${clientId}/status`, { action: "resume" })).status,
    ).toBe(409);
    const paused = await trainer.http.post(`/v1/clients/${clientId}/status`, { action: "pause" });
    expect(paused.body.status).toBe("paused");
    const resumed = await trainer.http.post(`/v1/clients/${clientId}/status`, { action: "resume" });
    expect(resumed.body.status).toBe("active");

    const archived = await trainer.http.post(`/v1/clients/${clientId}/status`, {
      action: "archive",
      reason: "Moved cities",
    });
    expect(archived.body).toMatchObject({ status: "archived" });
    expect(archived.body.archivedAt).not.toBeNull();
    const appointment = (await trainer.http.get(`/v1/appointments/${future.id}`)).body;
    expect(appointment).toMatchObject({
      status: "cancelled",
      cancelReason: "Client archived",
      lateCancel: false,
    });
    expect(archived.body.recentActivity[0]).toMatchObject({
      type: "client_archived",
      data: { from: "active", to: "archived", reason: "Moved cities", cancelledSessions: 1 },
    });
    expect((await trainer.http.get("/v1/clients?status=archived")).body.items).toHaveLength(1);

    const restored = await trainer.http.post(`/v1/clients/${clientId}/status`, {
      action: "restore",
    });
    expect(restored.body).toMatchObject({ status: "active", archivedAt: null });
    expect(restored.body.notes).toEqual([expect.objectContaining({ body: "Kept forever" })]);
    expect(restored.body.goals).toHaveLength(2);
  });

  it("refuses to restore past the plan limit or onto a contact someone else now uses", async () => {
    const trainer = await signedInTrainer();
    const phone = uniquePhone();
    const old = await newClient(trainer, { fullName: "Old Asha", phone });
    await trainer.http.post(`/v1/clients/${old}/status`, { action: "archive" });
    await newClient(trainer, { fullName: "New Asha", phone });
    const clash = await trainer.http.post(`/v1/clients/${old}/status`, { action: "restore" });
    expect(clash.status).toBe(409);
    expect(clash.body.message).toBe(
      "New Asha already uses this phone number or email, so Old Asha can't be restored.",
    );

    const other = await newClient(trainer, { fullName: "Third" });
    await trainer.http.post(`/v1/clients/${other}/status`, { action: "archive" });
    await owner.query("update workspace_plans set max_active_clients = 1 where workspace_id = $1", [
      await workspaceOf(trainer),
    ]);
    const limited = await trainer.http.post(`/v1/clients/${other}/status`, { action: "restore" });
    expect(limited.status).toBe(409);
    expect(limited.body.code).toBe("PLAN_LIMIT");
  });
});

describe("access", () => {
  it("can't see or change another trainer's clients (tampering)", async () => {
    const a = await signedInTrainer();
    const b = await signedInTrainer();
    const clientA = await newClient(a);
    expect((await b.http.get(`/v1/clients/${clientA}`)).status).toBe(404);
    expect((await b.http.get(`/v1/clients/${clientA}/schedule`)).status).toBe(404);
    expect((await b.http.post(`/v1/clients/${clientA}/notes`, { body: "x" })).status).toBe(404);
    expect((await b.http.post(`/v1/clients/${clientA}/status`, { action: "archive" })).status).toBe(
      404,
    );
    expect((await b.http.get("/v1/clients")).body.counts.active).toBe(0);
    expect((await a.http.get(`/v1/clients/${clientA}`)).body.status).toBe("active");
  });
});
