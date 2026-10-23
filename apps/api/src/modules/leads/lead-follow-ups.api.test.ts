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

/** A calendar day in the test workspaces' time zone (Asia/Kolkata), `offset` days from today. */
function day(offset = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}

async function addLead(trainer: SignedIn, overrides: Record<string, unknown> = {}) {
  const response = await trainer.http.post("/v1/leads", {
    fullName: "Meena Singh",
    phone: "98123 45678",
    goal: "lose_weight",
    source: "walk_in",
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body as { id: string };
}

async function schedule(trainer: SignedIn, leadId: string, body: Record<string, unknown> = {}) {
  const response = await trainer.http.post(`/v1/leads/${leadId}/follow-ups`, {
    actionType: "call",
    dueDate: day(1),
    dueTime: "10:00",
    ...body,
  });
  expect(response.status).toBe(201);
  return response.body;
}

describe("follow-ups", () => {
  it("schedules in the workspace time zone and shows the next one on the lead", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    const detail = await schedule(trainer, lead.id, {
      dueDate: day(2),
      dueTime: "18:30",
      notes: "Ask about evening slots",
      reminder: "in_app",
    });

    expect(detail.followUps).toEqual([
      expect.objectContaining({
        actionType: "call",
        dueDate: day(2),
        dueTime: "18:30",
        status: "open",
        state: "upcoming",
        notes: "Ask about evening slots",
        reminder: "in_app",
      }),
    ]);
    // 18:30 in Kolkata (UTC+5:30) is 13:00 UTC.
    expect(detail.followUps[0].dueAt).toMatch(/T13:00:00\.000Z$/);
    expect(detail.nextFollowUpAt).toBe(detail.followUps[0].dueAt);
    expect(detail.activities[0]).toMatchObject({
      type: "follow_up_scheduled",
      data: { actionType: "call", dueDate: day(2), dueTime: "18:30" },
    });
  });

  it("refuses past dates and dates more than a year ahead", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    const past = await trainer.http.post(`/v1/leads/${lead.id}/follow-ups`, {
      actionType: "call",
      dueDate: day(-1),
      dueTime: "10:00",
    });
    expect(past.status).toBe(400);
    expect(past.body.fieldErrors.dueDate).toEqual(["Choose today or a later date"]);
    const far = await trainer.http.post(`/v1/leads/${lead.id}/follow-ups`, {
      actionType: "call",
      dueDate: day(400),
      dueTime: "10:00",
    });
    expect(far.body.fieldErrors.dueDate).toEqual(["Choose a date within the next year"]);
  });

  it("marks today and overdue, counts them, and filters and sorts the list by them", async () => {
    const trainer = await signedInTrainer();
    const overdue = await addLead(trainer, { fullName: "Asha Rao", phone: "9800000101" });
    const dueToday = await addLead(trainer, { fullName: "Bhavna Iyer", phone: "9800000102" });
    const later = await addLead(trainer, { fullName: "Ravi Kumar", phone: "9800000103" });
    await addLead(trainer, { fullName: "Zoya Khan", phone: "9800000104" });
    await schedule(trainer, overdue.id, { dueDate: day(0), dueTime: "09:00" });
    await schedule(trainer, dueToday.id, { dueDate: day(0), dueTime: "23:59" });
    await schedule(trainer, later.id, { dueDate: day(3) });
    // Move the first one two days into the past (the API never accepts past dates).
    await owner.query(
      "update lead_follow_ups set due_at = due_at - interval '2 days' where lead_id = $1",
      [overdue.id],
    );

    const list = await trainer.http.get("/v1/leads");
    expect(
      list.body.items.map((item: { fullName: string; followUpState: string | null }) => [
        item.fullName,
        item.followUpState,
      ]),
    ).toEqual([
      ["Asha Rao", "overdue"],
      ["Bhavna Iyer", "today"],
      ["Ravi Kumar", "upcoming"],
      ["Zoya Khan", null],
    ]);

    const names = async (filter: string) =>
      (await trainer.http.get(`/v1/leads?followUp=${filter}`)).body.items.map(
        (item: { fullName: string }) => item.fullName,
      );
    expect(await names("due")).toEqual(["Asha Rao", "Bhavna Iyer"]);
    expect(await names("overdue")).toEqual(["Asha Rao"]);
    expect(await names("today")).toEqual(["Bhavna Iyer"]);
    expect(await names("next_7_days")).toEqual(["Bhavna Iyer", "Ravi Kumar"]);
    expect(await names("none")).toEqual(["Zoya Khan"]);

    const summary = await trainer.http.get("/v1/leads/summary");
    expect(summary.body.kpis).toMatchObject({ followUpsDue: 2, followUpsOverdue: 1 });

    const page = await trainer.http.get("/v1/leads?limit=2");
    const rest = await trainer.http.get(
      `/v1/leads?limit=2&cursor=${encodeURIComponent(page.body.nextCursor)}`,
    );
    expect(rest.body.items.map((item: { fullName: string }) => item.fullName)).toEqual([
      "Ravi Kumar",
      "Zoya Khan",
    ]);
  });

  it("completes with an outcome, logs the contact and schedules the next one in one go", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    const scheduled = await schedule(trainer, lead.id, { actionType: "whatsapp" });
    const followUpId = scheduled.followUps[0].id;

    const noOutcome = await trainer.http.post(
      `/v1/leads/${lead.id}/follow-ups/${followUpId}/complete`,
      { status: "done" },
    );
    expect(noOutcome.body.fieldErrors.outcome).toEqual(["Choose how it went"]);

    const done = await trainer.http.post(`/v1/leads/${lead.id}/follow-ups/${followUpId}/complete`, {
      status: "done",
      outcome: "message_sent",
      outcomeNote: "Sent trial times",
      logContact: true,
      templatePurpose: "follow_up",
      next: { actionType: "call", dueDate: day(4), dueTime: "11:00" },
    });
    expect(done.status).toBe(200);
    expect(done.body.followUps.map((f: { status: string }) => f.status)).toEqual(["open", "done"]);
    expect(done.body.followUps[1]).toMatchObject({
      outcome: "message_sent",
      outcomeNote: "Sent trial times",
      state: null,
    });
    expect(done.body.nextFollowUpAt).toBe(done.body.followUps[0].dueAt);
    // The contact moved the lead from New to Contacted and set the last contact.
    expect(done.body.stage).toBe("contacted");
    expect(done.body.lastContactAt).not.toBeNull();
    const types = done.body.activities.map((a: { type: string }) => a.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "follow_up_completed",
        "contact_logged",
        "stage_changed",
        "follow_up_scheduled",
      ]),
    );
    expect(
      done.body.activities.find((a: { type: string }) => a.type === "contact_logged").data,
    ).toMatchObject({
      channel: "whatsapp",
      outcome: "message_sent",
      note: "Sent trial times",
      templatePurpose: "follow_up",
      followUpId,
    });

    // Double submit: the same answer is a no-op, a different one a conflict.
    const again = await trainer.http.post(
      `/v1/leads/${lead.id}/follow-ups/${followUpId}/complete`,
      { status: "done", outcome: "message_sent", logContact: true },
    );
    expect(again.status).toBe(200);
    expect(
      again.body.activities.filter((a: { type: string }) => a.type === "contact_logged"),
    ).toHaveLength(1);
    const skip = await trainer.http.post(`/v1/leads/${lead.id}/follow-ups/${followUpId}/complete`, {
      status: "skipped",
    });
    expect(skip.status).toBe(409);
    const edit = await trainer.http.patch(`/v1/leads/${lead.id}/follow-ups/${followUpId}`, {
      actionType: "call",
      dueDate: day(1),
      dueTime: "10:00",
    });
    expect(edit.status).toBe(409);
  });

  it("rolls back the whole completion when the next follow-up is invalid", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    const scheduled = await schedule(trainer, lead.id);
    const followUpId = scheduled.followUps[0].id;

    const failed = await trainer.http.post(
      `/v1/leads/${lead.id}/follow-ups/${followUpId}/complete`,
      {
        status: "done",
        outcome: "spoke",
        logContact: true,
        next: { actionType: "call", dueDate: day(-3), dueTime: "10:00" },
      },
    );
    expect(failed.status).toBe(400);
    expect(failed.body.fieldErrors["next.dueDate"]).toEqual(["Choose today or a later date"]);
    const after = await trainer.http.get(`/v1/leads/${lead.id}`);
    expect(after.body.followUps.map((f: { status: string }) => f.status)).toEqual(["open"]);
    expect(after.body.stage).toBe("new");
    expect(after.body.lastContactAt).toBeNull();
  });

  it("skips without an outcome and reschedules open ones", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    const first = (await schedule(trainer, lead.id)).followUps[0].id;
    const moved = await trainer.http.patch(`/v1/leads/${lead.id}/follow-ups/${first}`, {
      actionType: "email",
      dueDate: day(5),
      dueTime: "08:15",
    });
    expect(moved.body.followUps[0]).toMatchObject({
      actionType: "email",
      dueDate: day(5),
      dueTime: "08:15",
    });
    expect(moved.body.activities.map((a: { type: string }) => a.type)).toContain(
      "follow_up_rescheduled",
    );

    const skipped = await trainer.http.post(`/v1/leads/${lead.id}/follow-ups/${first}/complete`, {
      status: "skipped",
    });
    expect(skipped.body.followUps[0]).toMatchObject({ status: "skipped", outcome: null });
    expect(skipped.body.nextFollowUpAt).toBeNull();
    expect(skipped.body.lastContactAt).toBeNull();
  });
});

describe("log contact and WhatsApp", () => {
  it("logs a contact that shows in the timeline and updates the last contact", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    const logged = await trainer.http.post(`/v1/leads/${lead.id}/contacts`, {
      channel: "call",
      outcome: "no_answer",
      note: "Try after 6",
    });
    expect(logged.status).toBe(201);
    expect(logged.body.lastContactAt).not.toBeNull();
    expect(
      logged.body.activities.find((a: { type: string }) => a.type === "contact_logged"),
    ).toMatchObject({ data: { channel: "call", outcome: "no_answer", note: "Try after 6" } });
    expect(logged.body.canDelete).toBe(false);
    expect((await trainer.http.delete(`/v1/leads/${lead.id}`)).status).toBe(409);
  });

  it("prefills click-to-chat from the workspace's follow_up template", async () => {
    const trainer = await signedInTrainer();
    await trainer.http.put("/v1/settings/message-templates/follow_up", {
      body: "Hi {first_name}! {trainer_name} here — free for a trial this week? 50% off & more",
    });
    const lead = await addLead(trainer, { fullName: "Meena Singh" });
    const detail = (await trainer.http.get(`/v1/leads/${lead.id}`)).body;
    const text = "Hi Meena! Test Trainer here — free for a trial this week? 50% off & more";
    expect(detail.whatsApp).toEqual({
      purpose: "follow_up",
      text,
      url: `https://wa.me/919812345678?text=${encodeURIComponent(text)}`,
    });
    const list = (await trainer.http.get("/v1/leads")).body;
    expect(list.items[0].whatsApp.url).toBe(detail.whatsApp.url);

    const emailOnly = await addLead(trainer, { phone: "", email: "x@example.test" });
    expect((await trainer.http.get(`/v1/leads/${emailOnly.id}`)).body.whatsApp).toBeNull();
  });
});

describe("access", () => {
  it("can't schedule, complete or log on another trainer's lead (tampering)", async () => {
    const a = await signedInTrainer();
    const b = await signedInTrainer();
    const lead = await addLead(a);
    const followUpId = (await schedule(a, lead.id)).followUps[0].id;

    const body = { actionType: "call", dueDate: day(1), dueTime: "10:00" };
    expect((await b.http.post(`/v1/leads/${lead.id}/follow-ups`, body)).status).toBe(404);
    expect((await b.http.patch(`/v1/leads/${lead.id}/follow-ups/${followUpId}`, body)).status).toBe(
      404,
    );
    expect(
      (
        await b.http.post(`/v1/leads/${lead.id}/follow-ups/${followUpId}/complete`, {
          status: "skipped",
        })
      ).status,
    ).toBe(404);
    expect(
      (await b.http.post(`/v1/leads/${lead.id}/contacts`, { channel: "call", outcome: "spoke" }))
        .status,
    ).toBe(404);

    // B's own lead with A's follow-up id: still not found.
    const own = await addLead(b);
    expect(
      (
        await b.http.post(`/v1/leads/${own.id}/follow-ups/${followUpId}/complete`, {
          status: "skipped",
        })
      ).status,
    ).toBe(404);
    expect((await a.http.get(`/v1/leads/${lead.id}`)).body.followUps[0].status).toBe("open");
  });

  it("refuses follow-ups on archived leads", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    await trainer.http.post(`/v1/leads/${lead.id}/archive`);
    const refused = await trainer.http.post(`/v1/leads/${lead.id}/follow-ups`, {
      actionType: "call",
      dueDate: day(1),
      dueTime: "10:00",
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("CONFLICT_STATE");
  });
});
