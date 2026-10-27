import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { CheckInInput, CreateInviteResponse } from "@fitcoach/shared";
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

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
});

afterAll(async () => {
  await app.close();
  await system.end();
});

const ZONE = "Asia/Kolkata";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date());
const isoWeekday = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`).getUTCDay();
  return value === 0 ? 7 : value;
};

const ANSWERS: CheckInInput = {
  feeling: "good",
  energy: 7,
  sleep: 6,
  soreness: "mild",
  notes: "Legs a bit sore",
  workoutFeedback: "Squats felt heavy",
};

let counter = 0;
/** A trainer and a client signed in on a phone. */
async function setUp() {
  const trainer = await signedInTrainer();
  const onboarded = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName: "Asha Rao",
      phone: `93${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`,
      primaryGoal: "build_muscle",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    })
    .set("Idempotency-Key", randomUUID());
  expect(onboarded.status, JSON.stringify(onboarded.body)).toBe(201);
  const clientId: string = onboarded.body.clientId;
  const invite = (
    await trainer.http.post(`/v1/clients/${clientId}/portal/invite`, { channel: "whatsapp" })
  ).body as CreateInviteResponse;
  const phone = client();
  expect(
    (
      await phone.post("/v1/client-auth/invite/accept", {
        token: invite.link.split("/invite/")[1],
        acceptTerms: true,
      })
    ).status,
  ).toBe(200);
  return { trainer, clientId, phone };
}

describe("check-ins", () => {
  it("lets the client check in once a day, edit it, and get the trainer's reply", async () => {
    const { trainer, clientId, phone } = await setUp();
    const before = await phone.get("/v1/client/check-in");
    expect(before.body).toMatchObject({ today: today(), enabled: true, due: true, todays: null });
    expect((await phone.get("/v1/client/home")).body.checkInDue).toBe(true);

    expect((await phone.put("/v1/client/check-in", { ...ANSWERS, energy: 11 })).status).toBe(400);
    const sent = await phone.put("/v1/client/check-in", ANSWERS);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);
    expect(sent.body).toMatchObject({ due: false, todays: { energy: 7, edited: false } });
    expect((await phone.get("/v1/client/home")).body.checkInDue).toBe(false);

    // The inbox: unreviewed first.
    const inbox = await trainer.http.get("/v1/check-ins?status=unreviewed");
    expect(inbox.body.counts).toEqual({ unreviewed: 1, reviewed: 0 });
    expect(inbox.body.items[0]).toMatchObject({
      client: { id: clientId, fullName: "Asha Rao" },
      feeling: "good",
      workoutFeedback: "Squats felt heavy",
    });
    const id: string = inbox.body.items[0].id;
    const reviewed = await trainer.http.post(`/v1/check-ins/${id}/review`, {
      reply: "Rest well tonight.",
    });
    expect(reviewed.body).toMatchObject({ reply: "Rest well tonight." });
    expect(reviewed.body.reviewedAt).not.toBeNull();
    expect((await trainer.http.get("/v1/check-ins?status=unreviewed")).body.items).toHaveLength(0);
    expect((await phone.get("/v1/client/check-in")).body.todays.reply).toBe("Rest well tonight.");

    // A same-day edit (or a double submit) updates the one check-in and sends it back for review.
    const edited = await phone.put("/v1/client/check-in", { ...ANSWERS, energy: 4 });
    expect(edited.body.todays).toMatchObject({ id, energy: 4, edited: true, reviewedAt: null });
    expect((await trainer.http.get("/v1/check-ins?status=unreviewed")).body.counts).toEqual({
      unreviewed: 1,
      reviewed: 0,
    });
    const revisions = await system.query(
      "select previous->>'energy' as energy from check_in_revisions where check_in_id = $1",
      [id],
    );
    expect(revisions.rows).toEqual([{ energy: "7" }]);
  });

  it("follows the trainer's per-client settings and offers a Nudge link", async () => {
    const { trainer, clientId, phone } = await setUp();
    const tab = await trainer.http.get(`/v1/clients/${clientId}/check-ins`);
    expect(tab.body.settings).toMatchObject({ enabled: true, days: null });
    expect(tab.body.settings.effectiveDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(tab.body.dueToday).toBe(true);
    expect(tab.body.nudge.url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(tab.body.nudge.text).toContain("/client/check-in");

    const otherDay = isoWeekday(today()) === 1 ? 2 : 1;
    const days = await trainer.http.put(`/v1/clients/${clientId}/check-in-settings`, {
      enabled: true,
      days: [otherDay],
    });
    expect(days.body.settings).toMatchObject({ days: [otherDay], effectiveDays: [otherDay] });
    expect(days.body.dueToday).toBe(false);
    expect((await phone.get("/v1/client/check-in")).body).toMatchObject({
      enabled: true,
      due: false,
    });
    // Not due, but a client may still send one.
    expect((await phone.put("/v1/client/check-in", ANSWERS)).status).toBe(200);
    const trend = (await trainer.http.get(`/v1/clients/${clientId}/check-ins`)).body.trend;
    expect(trend).toEqual([{ date: today(), energy: 7, sleep: 6, feeling: 4 }]);

    await trainer.http.put(`/v1/clients/${clientId}/check-in-settings`, {
      enabled: false,
      days: null,
    });
    expect((await phone.get("/v1/client/check-in")).body).toMatchObject({
      enabled: false,
      due: false,
    });
    expect((await phone.put("/v1/client/check-in", ANSWERS)).status).toBe(403);
    expect((await trainer.http.get(`/v1/clients/${clientId}/check-ins`)).body.nudge).toBeNull();
  });

  it("keeps check-ins to their workspace and client (tampering)", async () => {
    const one = await setUp();
    await one.phone.put("/v1/client/check-in", ANSWERS);
    const id = (await one.trainer.http.get("/v1/check-ins")).body.items[0].id;
    const other = await signedInTrainer();
    expect((await other.http.get("/v1/check-ins")).body.items).toHaveLength(0);
    expect((await other.http.post(`/v1/check-ins/${id}/review`, {})).status).toBe(404);
    expect((await other.http.get(`/v1/clients/${one.clientId}/check-ins`)).status).toBe(404);
    expect(
      (
        await other.http.put(`/v1/clients/${one.clientId}/check-in-settings`, {
          enabled: false,
          days: null,
        })
      ).status,
    ).toBe(404);
    expect((await one.phone.get("/v1/check-ins")).status).toBe(403);
    expect((await one.phone.post(`/v1/check-ins/${id}/review`, {})).status).toBe(403);
    expect((await other.http.get("/v1/client/check-in")).status).toBe(403);
  });
});
