import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { CreateInviteResponse, DashboardSummary } from "@fitcoach/shared";
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
const day = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
/** Local HH:MM `minutes` from now, clamped into today so the test never crosses midnight. */
const laterToday = (minutes: number) => {
  const at = new Date(Date.now() + minutes * 60_000);
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(at) === day(0)
    ? local
    : "23:00";
};

let counter = 0;
const phone = () => `91${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`;

describe("dashboard summary", () => {
  it("shows zeros and the full checklist for a brand-new workspace", async () => {
    const trainer = await signedInTrainer();
    const summary = (await trainer.http.get("/v1/dashboard/summary")).body as DashboardSummary;
    expect(summary.today).toBe(day(0));
    expect(summary.kpis).toEqual({
      sessions: { total: 0, inPerson: 0, online: 0, trials: 0 },
      activeClients: 0,
      newLeads: 0,
      followUps: { due: 0, overdue: 0 },
      checkInsToReview: 0,
      paymentsDue: 0,
      packagesExpiring: 0,
    });
    expect(summary.schedule).toEqual([]);
    expect(summary.attention).toEqual([]);
    expect(summary.activity).toEqual([]);
    expect(summary.checklist).toEqual({
      visible: true,
      steps: [
        { key: "public_page", done: false },
        { key: "first_person", done: false },
        { key: "program", done: false },
        { key: "invite", done: false },
      ],
    });
  });

  it("counts real data in the workspace time zone and orders Needs attention as specified", async () => {
    const trainer = await signedInTrainer();
    const me = await trainer.http.get("/v1/auth/me");
    const workspaceId: string = me.body.workspace.id;

    const onboarded = await trainer.http
      .post("/v1/onboarding/finalize", {
        fullName: "Asha Rao",
        phone: phone(),
        primaryGoal: "lose_weight",
        trainingMode: "in_person",
        consentDataProcessing: true,
        units: { weightUnit: "kg", lengthUnit: "cm" },
      })
      .set("Idempotency-Key", randomUUID());
    const clientId: string = onboarded.body.clientId;
    const sold = await trainer.http
      .post(`/v1/clients/${clientId}/packages`, {
        name: "2 sessions",
        kind: "session_pack",
        sessionsIncluded: 2,
        sessionsPerWeek: null,
        startsOn: day(-1),
        expiresOn: day(60),
        pricePaise: 500_000,
        amountDuePaise: 500_000,
        paymentDueOn: day(0),
      })
      .set("Idempotency-Key", randomUUID());
    expect(sold.status, JSON.stringify(sold.body)).toBe(200);

    const lead = await trainer.http.post("/v1/leads", {
      fullName: "Meena Singh",
      phone: phone(),
      goal: "lose_weight",
      source: "instagram",
    });
    expect(lead.status, JSON.stringify(lead.body)).toBe(201);
    const leadId: string = lead.body.id;
    await system.query(
      `insert into lead_follow_ups (workspace_id, lead_id, action_type, due_at, created_by_user_id)
       values ($1, $2, 'call', now() - interval '2 hours', (select owner_user_id from workspaces where id = $1))`,
      [workspaceId, leadId],
    );

    const book = (body: Record<string, unknown>) => trainer.http.post("/v1/appointments", body);
    expect(
      (
        await book({
          clientId,
          kind: "session",
          date: day(0),
          startTime: laterToday(60),
          durationMin: 30,
          location: "Studio",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await book({
          clientId,
          kind: "online_session",
          date: day(0),
          startTime: laterToday(120),
          durationMin: 30,
          meetingUrl: "https://meet.example.com/x",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await book({
          clientId,
          kind: "session",
          date: day(-1),
          startTime: "07:00",
          durationMin: 30,
        })
      ).status,
    ).toBe(201);
    expect(
      (await book({ leadId, kind: "trial", date: day(1), startTime: "08:00", durationMin: 30 }))
        .status,
    ).toBe(201);
    await system.query(
      `insert into check_ins (workspace_id, client_id, local_date, feeling, energy, sleep, soreness)
       values ($1, $2, $3, 'tired', 4, 5, 'mild')`,
      [workspaceId, clientId, day(0)],
    );

    const summary = (await trainer.http.get("/v1/dashboard/summary")).body as DashboardSummary;
    expect(summary.kpis).toEqual({
      sessions: { total: 2, inPerson: 1, online: 1, trials: 0 },
      activeClients: 1,
      newLeads: 1,
      followUps: { due: 1, overdue: 1 },
      checkInsToReview: 1,
      paymentsDue: 1,
      packagesExpiring: 1,
    });
    expect(summary.schedule.map((item) => [item.kind, item.person.fullName])).toEqual([
      ["session", "Asha Rao"],
      ["online_session", "Asha Rao"],
    ]);
    expect(summary.attention.map((group) => group.kind)).toEqual([
      "follow_up_overdue",
      "trial_soon",
      "payment_due",
      "package_low",
      "check_in_review",
      "attendance",
    ]);
    const payment = summary.attention.find((group) => group.kind === "payment_due")?.items[0];
    expect(payment).toMatchObject({
      title: "Asha Rao",
      href: `/app/clients/${clientId}?tab=packages`,
    });
    expect(payment?.detail).toContain("₹5,000");
    expect(payment?.whatsApp?.url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(payment?.whatsApp?.text).toContain("₹5,000");
    const renewal = summary.attention.find((group) => group.kind === "package_low")?.items[0];
    expect(renewal?.detail).toContain("2 sessions left");
    expect(renewal?.whatsApp?.text).toContain("2");
    expect(
      summary.attention.find((group) => group.kind === "check_in_review")?.items[0]?.detail,
    ).toContain("self-reported");
    expect(summary.activity.map((entry) => entry.type)).toEqual([
      "package_sold",
      "client_onboarded",
    ]);

    // Prev/next day moves the schedule, never the KPIs.
    const yesterday = (await trainer.http.get(`/v1/dashboard/summary?date=${day(-1)}`)).body;
    expect(yesterday.schedule).toHaveLength(1);
    expect(yesterday.kpis.sessions.total).toBe(2);

    // Checklist from real data, then dismissed.
    expect(summary.checklist.steps).toEqual([
      { key: "public_page", done: false },
      { key: "first_person", done: true },
      { key: "program", done: false },
      { key: "invite", done: false },
    ]);
    expect((await trainer.http.post("/v1/dashboard/checklist/dismiss")).status).toBe(200);
    expect((await trainer.http.get("/v1/dashboard/summary")).body.checklist.visible).toBe(false);
  });

  it("never mixes workspaces, and clients can't open it", async () => {
    const a = await signedInTrainer();
    const onboarded = await a.http
      .post("/v1/onboarding/finalize", {
        fullName: "Asha Rao",
        phone: phone(),
        primaryGoal: "lose_weight",
        trainingMode: "in_person",
        consentDataProcessing: true,
        units: { weightUnit: "kg", lengthUnit: "cm" },
      })
      .set("Idempotency-Key", randomUUID());
    const b = await signedInTrainer();
    const theirs = (await b.http.get("/v1/dashboard/summary")).body as DashboardSummary;
    expect(theirs.kpis.activeClients).toBe(0);
    expect(theirs.activity).toEqual([]);
    const invite = (
      await a.http.post(`/v1/clients/${onboarded.body.clientId}/portal/invite`, {
        channel: "whatsapp",
      })
    ).body as CreateInviteResponse;
    const phoneClient = client();
    await phoneClient.post("/v1/client-auth/invite/accept", {
      token: invite.link.split("/invite/")[1],
      acceptTerms: true,
    });
    expect((await phoneClient.get("/v1/dashboard/summary")).status).toBe(403);
    expect((await phoneClient.post("/v1/dashboard/checklist/dismiss")).status).toBe(403);
  });
});
