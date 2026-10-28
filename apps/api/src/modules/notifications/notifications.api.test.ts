import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type {
  CreateInviteResponse,
  NotificationListResponse,
  ProgramDetail,
} from "@fitcoach/shared";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";
import { JobsService } from "../jobs/jobs.service";
import { MaintenanceService } from "../maintenance/maintenance.service";
import { NotificationJobsService } from "./notification-jobs.service";

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
const isoWeekday = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`).getUTCDay();
  return value === 0 ? 7 : value;
};

let counter = 0;
const phone = () => `90${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`;

async function workspaceOf(trainer: SignedIn): Promise<{ id: string; userId: string }> {
  const me = await trainer.http.get("/v1/auth/me");
  return { id: me.body.workspace.id, userId: me.body.user.id };
}

async function newClient(trainer: SignedIn): Promise<string> {
  const response = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName: "Asha Rao",
      phone: phone(),
      primaryGoal: "lose_weight",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    })
    .set("Idempotency-Key", randomUUID());
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.clientId;
}

const typesOf = (list: NotificationListResponse) => list.items.map((item) => item.type);

describe("notification jobs", () => {
  it("notifies an overdue follow-up and an expiring package exactly once, even after a restart", async () => {
    const trainer = await signedInTrainer();
    const workspace = await workspaceOf(trainer);
    const clientId = await newClient(trainer);
    const lead = await trainer.http.post("/v1/leads", {
      fullName: "Meena Singh",
      phone: phone(),
      goal: "lose_weight",
      source: "instagram",
    });
    await system.query(
      `insert into lead_follow_ups (workspace_id, lead_id, action_type, due_at, created_by_user_id)
       values ($1, $2, 'call', now() - interval '3 hours', $3)`,
      [workspace.id, lead.body.id, workspace.userId],
    );
    const sold = await trainer.http
      .post(`/v1/clients/${clientId}/packages`, {
        name: "10 sessions",
        kind: "session_pack",
        sessionsIncluded: 10,
        sessionsPerWeek: null,
        startsOn: day(-20),
        expiresOn: day(3),
        pricePaise: 1_000_000,
        amountDuePaise: 0,
        paymentDueOn: null,
      })
      .set("Idempotency-Key", randomUUID());
    expect(sold.status, JSON.stringify(sold.body)).toBe(200);

    const jobs = app.get(NotificationJobsService);
    // Jobs span every workspace (other test files run in parallel), so count this workspace only.
    await jobs.followUps();
    await jobs.packages(null);
    // Again, and from a fresh API process (a restart): nothing new.
    await jobs.followUps();
    const restarted = await createTestApp();
    try {
      const again = restarted.get(NotificationJobsService);
      await again.followUps();
      await again.packages(null);
    } finally {
      await restarted.close();
    }

    const list = (await trainer.http.get("/v1/notifications")).body as NotificationListResponse;
    expect(typesOf(list).filter((type) => type === "follow_up_due")).toHaveLength(1);
    expect(typesOf(list).filter((type) => type === "package_expiring")).toHaveLength(1);
    const followUp = list.items.find((item) => item.type === "follow_up_due");
    expect(followUp).toMatchObject({
      title: "Follow-up due: Meena Singh",
      link: `/app/leads/${lead.body.id}`,
    });
    expect(list.unreadCount).toBe(list.items.length);
  });

  it("records each run's outcome for the health page", async () => {
    const jobsService = app.get(JobsService);
    await jobsService.run({
      name: "test.ok",
      cron: "* * * * *",
      handler: async () => ({ created: 2 }),
    });
    await expect(
      jobsService.run({
        name: "test.fails",
        cron: "* * * * *",
        handler: async () => {
          throw new Error("boom");
        },
      }),
    ).rejects.toThrow("boom");
    const runs = await system.query<{
      name: string;
      status: string;
      summary: unknown;
      error: string | null;
    }>(
      "select name, status, summary, error from job_runs where name like 'test.%' order by finished_at desc limit 2",
    );
    expect(runs.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "test.ok", status: "succeeded", summary: { created: 2 } }),
        expect.objectContaining({ name: "test.fails", status: "failed", error: "boom" }),
      ]),
    );
  });

  it("purges spent rate-limit buckets and idempotency keys", async () => {
    await system.query(
      "insert into rate_limit_buckets (key, window_start, hits, expires_at) values ($1, now() - interval '2 hours', 1, now() - interval '1 hour')",
      [`test:${randomUUID()}`],
    );
    const purged = await app.get(MaintenanceService).purge();
    expect(purged.rateLimitBuckets).toBeGreaterThanOrEqual(1);
    expect(Object.keys(purged).sort()).toEqual([
      "authTokens",
      "idempotencyKeys",
      "jobRuns",
      "rateLimitBuckets",
      "sessions",
    ]);
  });
});

describe("notifications in the app", () => {
  it("tells clients about a new program and sessions, and trainers about invites and check-ins", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const invite = (
      await trainer.http.post(`/v1/clients/${clientId}/portal/invite`, { channel: "whatsapp" })
    ).body as CreateInviteResponse;
    const phoneClient = client();
    await phoneClient.post("/v1/client-auth/invite/accept", {
      token: invite.link.split("/invite/")[1],
      acceptTerms: true,
    });
    expect(typesOf((await trainer.http.get("/v1/notifications")).body)).toContain(
      "invite_accepted",
    );

    const templates = await trainer.http.get("/v1/programs/templates");
    const template = templates.body.templates.find(
      (t: { name: string }) => t.name === "Beginner Full Body 3×/week",
    );
    const program = (await trainer.http.post("/v1/programs", { fromProgramId: template.id }))
      .body as ProgramDetail;
    const today = isoWeekday(day(0));
    const others = [1, 2, 3, 4, 5, 6, 7].filter((value) => value !== today);
    await trainer.http
      .post(`/v1/programs/${program.id}/assign`, {
        clientId,
        startsOn: day(0),
        schedule: program.workouts.map((_, index) => ({
          workoutIndex: index,
          weekday: index === 0 ? today : others[index],
        })),
      })
      .set("Idempotency-Key", randomUUID());
    const booked = await trainer.http.post("/v1/appointments", {
      clientId,
      kind: "session",
      date: day(2),
      startTime: "09:00",
      durationMin: 45,
    });
    await trainer.http.post(`/v1/appointments/${booked.body.id}/cancel`, {
      reason: "Trainer unwell",
    });
    const clientList = (await phoneClient.get("/v1/notifications"))
      .body as NotificationListResponse;
    expect(typesOf(clientList).sort()).toEqual([
      "program_assigned",
      "session_booked",
      "session_cancelled",
    ]);
    expect(JSON.stringify(clientList)).not.toContain("Trainer unwell");

    // A check-in notifies the trainer once, even when edited.
    const answers = { feeling: "good", energy: 7, sleep: 6, soreness: "mild" };
    await phoneClient.put("/v1/client/check-in", answers);
    const edited = await phoneClient.put("/v1/client/check-in", { ...answers, energy: 8 });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const trainerList = (await trainer.http.get("/v1/notifications"))
      .body as NotificationListResponse;
    expect(typesOf(trainerList).filter((type) => type === "check_in_submitted")).toHaveLength(1);

    // Mark one read, then all.
    const first = trainerList.items[0];
    const afterOne = (await trainer.http.post(`/v1/notifications/${first?.id}/read`)).body;
    expect(afterOne.unreadCount).toBe(trainerList.unreadCount - 1);
    const afterAll = (await trainer.http.post("/v1/notifications/read-all")).body;
    expect(afterAll.unreadCount).toBe(0);

    // Nobody else's.
    const other = await signedInTrainer();
    expect((await other.http.get("/v1/notifications")).body.items).toEqual([]);
    expect((await other.http.post(`/v1/notifications/${first?.id}/read`)).status).toBe(404);
    expect((await phoneClient.post(`/v1/notifications/${first?.id}/read`)).status).toBe(404);
  });
});
