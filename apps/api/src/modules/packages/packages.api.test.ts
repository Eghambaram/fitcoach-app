import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";

let app: INestApplication;
let system: Pool;
const { signedInTrainer } = createHttpHelpers(
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
/** Local date and HH:MM in the workspace zone, `minutes` from now. */
function localIn(minutes: number): { date: string; startTime: string } {
  const at = new Date(Date.now() + minutes * 60_000);
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(at),
    startTime: new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(at),
  };
}

let counter = 0;
const uniquePhone = () =>
  `93${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`;

async function newClient(trainer: SignedIn, extra: Record<string, unknown> = {}) {
  const response = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName: "Asha Rao",
      phone: uniquePhone(),
      primaryGoal: "build_muscle",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
      ...extra,
    })
    .set("Idempotency-Key", randomUUID());
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.clientId as string;
}

const twelvePack = {
  name: "12 sessions",
  kind: "session_pack",
  sessionsIncluded: 12,
  sessionsPerWeek: null,
  startsOn: day(-10),
  expiresOn: day(31),
  pricePaise: 1_200_000,
  amountDuePaise: 1_000_000,
  paymentDueOn: day(0),
};

async function sell(trainer: SignedIn, clientId: string, body: Record<string, unknown> = {}) {
  const response = await trainer.http
    .post(`/v1/clients/${clientId}/packages`, { ...twelvePack, ...body })
    .set("Idempotency-Key", randomUUID());
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body;
}

let hour = 0;
/** A past session (hours apart, so none overlap). */
async function pastSession(trainer: SignedIn, clientId: string): Promise<string> {
  const response = await trainer.http.post("/v1/appointments", {
    clientId,
    kind: "session",
    date: day(-1 - Math.floor(hour / 12)),
    startTime: `${String(6 + (hour++ % 12)).padStart(2, "0")}:00`,
    durationMin: 45,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.id;
}

const mark = (trainer: SignedIn, id: string, status: string) =>
  trainer.http.post(`/v1/appointments/${id}/attendance`, { status });
const packagesOf = async (trainer: SignedIn, clientId: string) =>
  (await trainer.http.get(`/v1/clients/${clientId}/packages`)).body;

describe("selling, session use and payments", () => {
  it("sells a 12-session pack; 3 attended + 1 no-show + a partial payment add up everywhere", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const sold = await sell(trainer, clientId);
    expect(sold.active).toMatchObject({
      name: "12 sessions",
      status: "active",
      sessionsLeft: 12,
      balancePaise: 1_000_000,
      paymentOverdue: true,
    });

    const sessions = [];
    for (let i = 0; i < 4; i++) sessions.push(await pastSession(trainer, clientId));
    for (const id of sessions.slice(0, 3))
      expect((await mark(trainer, id, "completed")).status).toBe(200);
    const noShow = await mark(trainer, sessions[3] ?? "", "no_show");
    expect(noShow.body.sessionUse).toEqual({ packageName: "12 sessions", sessionsUsed: 1 });

    const paid = await trainer.http
      .post(`/v1/packages/${sold.active.id}/payments`, {
        amountPaise: 400_000,
        method: "upi",
        paidOn: day(0),
        reference: "UPI-123",
      })
      .set("Idempotency-Key", randomUUID());
    expect(paid.status).toBe(200);
    expect(paid.body.active).toMatchObject({
      sessionsUsed: 4,
      sessionsLeft: 8,
      paidPaise: 400_000,
      balancePaise: 600_000,
    });
    expect(paid.body.payments).toHaveLength(1);
    expect(paid.body.ledger.map((entry: { reason: string }) => entry.reason)).toEqual([
      "no_show",
      "attended",
      "attended",
      "attended",
    ]);

    const detail = (await trainer.http.get(`/v1/clients/${clientId}`)).body;
    expect(detail.package).toMatchObject({
      sessionsLeft: 8,
      sessionsIncluded: 12,
      balancePaise: 600_000,
    });
    const appointment = (await trainer.http.get(`/v1/appointments/${sessions[0]}`)).body;
    expect(appointment.clientPackage).toEqual({
      name: "12 sessions",
      kind: "session_pack",
      sessionsLeft: 8,
    });

    const due = (await trainer.http.get("/v1/clients?attention=payment_due")).body.items;
    expect(due.map((c: { id: string }) => c.id)).toEqual([clientId]);
    const low = (await trainer.http.get("/v1/clients?attention=low_sessions")).body.items;
    expect(low).toHaveLength(0);
  });

  it("deducts once for a double-submitted attendance, reverses on un-marking and switches reasons", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    await sell(trainer, clientId);
    const id = await pastSession(trainer, clientId);

    const [first, second] = await Promise.all([
      mark(trainer, id, "completed"),
      mark(trainer, id, "completed"),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect((await packagesOf(trainer, clientId)).active.sessionsUsed).toBe(1);

    expect((await mark(trainer, id, "scheduled")).body.sessionUse.sessionsUsed).toBe(0);
    let state = await packagesOf(trainer, clientId);
    expect(state.active.sessionsUsed).toBe(0);
    expect(state.ledger.map((e: { reversal: boolean }) => e.reversal)).toEqual([true, false]);

    // Marking again after an undo uses a session again; attended → no-show swaps the reason.
    await mark(trainer, id, "completed");
    await mark(trainer, id, "no_show");
    state = await packagesOf(trainer, clientId);
    expect(state.active.sessionsUsed).toBe(1);
    expect(state.ledger[0]).toMatchObject({ reason: "no_show", sessionsUsed: 1, reversal: false });
  });

  it("follows the no-show and late-cancel policy, and never deducts for time-based packages", async () => {
    const trainer = await signedInTrainer();
    expect(
      (
        await trainer.http.put("/v1/settings/package-policy", {
          noShowUsesSession: false,
          lateCancelWindowHours: 12,
          lateCancelUsesSession: true,
          lowSessionsThreshold: 2,
          expiryWarningDays: 7,
        })
      ).status,
    ).toBe(200);
    const clientId = await newClient(trainer);
    await sell(trainer, clientId);

    await mark(trainer, await pastSession(trainer, clientId), "no_show");
    const soon = await trainer.http.post("/v1/appointments", {
      clientId,
      kind: "session",
      ...localIn(120),
      durationMin: 30,
    });
    const later = await trainer.http.post("/v1/appointments", {
      clientId,
      kind: "session",
      date: day(5),
      startTime: "19:00",
      durationMin: 30,
    });
    await trainer.http.post(`/v1/appointments/${soon.body.id}/cancel`, {
      reason: "Sick",
      scope: "this",
    });
    await trainer.http.post(`/v1/appointments/${later.body.id}/cancel`, {
      reason: "Trip",
      scope: "this",
    });
    const state = await packagesOf(trainer, clientId);
    expect(state.active.sessionsUsed).toBe(1);
    expect(
      state.ledger.map((e: { reason: string; sessionsUsed: number }) => [e.reason, e.sessionsUsed]),
    ).toEqual([
      ["late_cancel", 1],
      ["no_show", 0],
    ]);

    const monthly = await newClient(trainer);
    await sell(trainer, monthly, {
      name: "Monthly unlimited",
      kind: "time_based",
      sessionsIncluded: null,
      sessionsPerWeek: 3,
      pricePaise: 500_000,
      amountDuePaise: 500_000,
    });
    const id = await pastSession(trainer, monthly);
    expect((await mark(trainer, id, "completed")).body.sessionUse.sessionsUsed).toBe(0);
    const unlimited = await packagesOf(trainer, monthly);
    expect(unlimited.active).toMatchObject({
      sessionsLeft: null,
      sessionsUsed: 0,
      sessionsPerWeek: 3,
    });
    expect(unlimited.ledger).toHaveLength(1);
  });

  it("records attendance without a package when none is left or none exists", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const none = await pastSession(trainer, clientId);
    const unpackaged = await mark(trainer, none, "completed");
    expect(unpackaged.status).toBe(200);
    expect(unpackaged.body).toMatchObject({ clientPackage: null, sessionUse: null });
    expect((await trainer.http.get(`/v1/clients/${clientId}`)).body.package).toBeNull();

    await sell(trainer, clientId, { sessionsIncluded: 1 });
    await mark(trainer, await pastSession(trainer, clientId), "completed");
    const extra = await mark(trainer, await pastSession(trainer, clientId), "completed");
    expect(extra.status).toBe(200);
    expect(extra.body.sessionUse).toBeNull();
    expect(extra.body.clientPackage.sessionsLeft).toBe(0);
    const state = await packagesOf(trainer, clientId);
    expect(state.active).toMatchObject({ sessionsUsed: 1, sessionsLeft: 0 });

    const low = (await trainer.http.get("/v1/clients?attention=low_sessions")).body.items;
    expect(low.map((c: { id: string }) => c.id)).toEqual([clientId]);
  });

  it("renews: closes the old package (completed, or expired after its date) and keeps history", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    await sell(trainer, clientId);
    const renewed = await sell(trainer, clientId, {
      name: "Renewal",
      startsOn: day(0),
      expiresOn: null,
    });
    expect(renewed.active.name).toBe("Renewal");
    expect(renewed.history).toEqual([
      expect.objectContaining({
        name: "12 sessions",
        status: "completed",
        closedReason: "Renewed",
      }),
    ]);

    const late = await newClient(trainer);
    await sell(trainer, late, { startsOn: day(-40), expiresOn: day(-1) });
    expect((await packagesOf(trainer, late)).active.status).toBe("expired");
    const afterExpiry = await sell(trainer, late, { startsOn: day(0), expiresOn: null });
    expect(afterExpiry.history[0]).toMatchObject({ status: "expired" });

    const cancelled = await trainer.http.post(`/v1/packages/${afterExpiry.active.id}/cancel`, {
      reason: "Sold by mistake",
    });
    expect(cancelled.body.active).toBeNull();
    expect(cancelled.body.history[0]).toMatchObject({
      status: "cancelled",
      closedReason: "Sold by mistake",
    });
  });

  it("guards payments: no overpaying, voids restore the balance, a key replays once", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const { active } = await sell(trainer, clientId);

    const tooMuch = await trainer.http.post(`/v1/packages/${active.id}/payments`, {
      amountPaise: 1_000_001,
      method: "cash",
      paidOn: day(0),
    });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.fieldErrors.amountPaise).toEqual(["Only ₹10,000 is still due"]);

    const key = randomUUID();
    const pay = () =>
      trainer.http
        .post(`/v1/packages/${active.id}/payments`, {
          amountPaise: 250_000,
          method: "cash",
          paidOn: day(0),
        })
        .set("Idempotency-Key", key);
    await pay();
    const replay = await pay();
    expect(replay.body.payments).toHaveLength(1);
    expect(replay.body.active.balancePaise).toBe(750_000);

    const paymentId = replay.body.payments[0].id;
    const voided = await trainer.http.post(`/v1/payments/${paymentId}/void`, {
      reason: "Wrong client",
    });
    expect(voided.body.active.balancePaise).toBe(1_000_000);
    expect(voided.body.payments[0].voided).toMatchObject({ reason: "Wrong client" });
    expect(
      (await trainer.http.post(`/v1/payments/${paymentId}/void`, { reason: "Again" })).status,
    ).toBe(409);
    expect((await trainer.http.post(`/v1/payments/${paymentId}/void`, { reason: "" })).status).toBe(
      400,
    );
  });

  it("needs a note for manual adjustments and keeps sessions left within the pack", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const { active } = await sell(trainer, clientId, { sessionsIncluded: 2 });
    const adjust = (body: object) =>
      trainer.http.post(`/v1/packages/${active.id}/adjustments`, body);
    expect((await adjust({ sessions: 1 })).status).toBe(400);
    expect((await adjust({ sessions: 3, note: "Too many" })).status).toBe(400);
    expect((await adjust({ sessions: -1, note: "Nothing used yet" })).status).toBe(400);
    const used = await adjust({ sessions: 1, note: "Session before FitCoach" });
    expect(used.body.active.sessionsLeft).toBe(1);
    expect(used.body.ledger[0]).toMatchObject({
      reason: "manual_adjustment",
      note: "Session before FitCoach",
    });
  });
});

describe("initial package at conversion and onboarding", () => {
  async function presetId(trainer: SignedIn, name: string): Promise<string> {
    const presets = (await trainer.http.get("/v1/settings/package-presets")).body.presets;
    return presets.find((preset: { name: string }) => preset.name === name).id;
  }

  it("sells the preset in the same transaction, with its sessions and expiry", async () => {
    const trainer = await signedInTrainer();
    const twelve = await presetId(trainer, "12 sessions");
    const clientId = await newClient(trainer, {
      coachingStartOn: "2031-03-01",
      initialPackage: { presetId: twelve, pricePaise: 900_000 },
    });
    const state = await packagesOf(trainer, clientId);
    expect(state.active).toMatchObject({
      name: "12 sessions",
      sessionsLeft: 12,
      startsOn: "2031-03-01",
      expiresOn: "2031-04-11",
      amountDuePaise: 900_000,
    });

    const lead = await trainer.http.post("/v1/leads", {
      fullName: "Ravi Kumar",
      phone: uniquePhone(),
      goal: "lose_weight",
      source: "walk_in",
    });
    expect(lead.status, JSON.stringify(lead.body)).toBe(201);
    const converted = await trainer.http
      .post(`/v1/leads/${lead.body.id}/convert`, {
        initialPackage: {
          presetId: await presetId(trainer, "Monthly unlimited"),
          pricePaise: 300_000,
        },
      })
      .set("Idempotency-Key", randomUUID());
    expect(converted.status, JSON.stringify(converted.body)).toBe(200);
    const fromLead = await packagesOf(trainer, converted.body.clientId);
    expect(fromLead.active).toMatchObject({ kind: "time_based", sessionsLeft: null });

    // Finishing onboarding with another package is refused: they already have one.
    const refused = await trainer.http
      .post("/v1/onboarding/finalize", {
        clientId: converted.body.clientId,
        fullName: "Ravi Kumar",
        primaryGoal: "lose_weight",
        trainingMode: "in_person",
        consentDataProcessing: true,
        units: { weightUnit: "kg", lengthUnit: "cm" },
        initialPackage: { presetId: twelve, pricePaise: 100 },
      })
      .set("Idempotency-Key", randomUUID());
    expect(refused.status).toBe(409);
    expect(refused.body.fieldErrors.initialPackage).toBeDefined();
  });
});

describe("tampering", () => {
  it("never reaches another workspace's packages or payments", async () => {
    const owner = await signedInTrainer();
    const other = await signedInTrainer();
    const clientId = await newClient(owner);
    const { active } = await sell(owner, clientId);
    const paid = await owner.http
      .post(`/v1/packages/${active.id}/payments`, {
        amountPaise: 100,
        method: "cash",
        paidOn: day(0),
      })
      .set("Idempotency-Key", randomUUID());
    const paymentId = paid.body.payments[0].id;

    expect((await other.http.get(`/v1/clients/${clientId}/packages`)).status).toBe(404);
    expect(
      (
        await other.http
          .post(`/v1/clients/${clientId}/packages`, twelvePack)
          .set("Idempotency-Key", randomUUID())
      ).status,
    ).toBe(404);
    expect(
      (
        await other.http.post(`/v1/packages/${active.id}/payments`, {
          amountPaise: 100,
          method: "cash",
          paidOn: day(0),
        })
      ).status,
    ).toBe(404);
    expect(
      (await other.http.post(`/v1/packages/${active.id}/adjustments`, { sessions: 1, note: "x" }))
        .status,
    ).toBe(404);
    expect(
      (await other.http.post(`/v1/packages/${active.id}/cancel`, { reason: "x" })).status,
    ).toBe(404);
    expect((await other.http.post(`/v1/payments/${paymentId}/void`, { reason: "x" })).status).toBe(
      404,
    );
    expect((await packagesOf(owner, clientId)).payments[0].voided).toBeNull();
  });
});
