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
/** A calendar day in the workspace zone, `offset` days from today. */
function day(offset = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}
/** The next Monday at least a week away, so a series never starts in the past. */
function nextMonday(): string {
  for (let offset = 7; offset < 14; offset++) {
    const date = day(offset);
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 1) return date;
  }
  throw new Error("unreachable");
}
/** Local date and HH:MM in the workspace zone, `minutes` from now. */
function localIn(minutes: number): { date: string; startTime: string } {
  const at = new Date(Date.now() + minutes * 60_000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return {
    date: new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(at),
    startTime: parts,
  };
}

let counter = 0;
async function newClient(trainer: SignedIn, fullName = "Asha Rao"): Promise<string> {
  const response = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName,
      phone: `95${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`,
      primaryGoal: "build_muscle",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    })
    .set("Idempotency-Key", randomUUID());
  expect(response.status).toBe(201);
  return response.body.clientId;
}

async function book(trainer: SignedIn, body: Record<string, unknown>) {
  const response = await trainer.http.post("/v1/appointments", {
    kind: "session",
    durationMin: 60,
    ...body,
  });
  expect(response.status).toBe(201);
  return response.body;
}

describe("booking", () => {
  it("books in the workspace time zone, lists it and blocks overlaps with a clear message", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const date = day(3);
    const session = await book(trainer, {
      clientId,
      date,
      startTime: "07:00",
      location: "FitLife Gym",
    });
    expect(session).toMatchObject({
      kind: "session",
      status: "scheduled",
      date,
      startTime: "07:00",
      endTime: "08:00",
      durationMin: 60,
      person: { kind: "client", id: clientId, fullName: "Asha Rao" },
      location: "FitLife Gym",
      needsAttendance: false,
      changes: [expect.objectContaining({ kind: "created" })],
    });
    // 07:00 in Kolkata is 01:30 UTC.
    expect(session.startsAt).toMatch(/T01:30:00\.000Z$/);

    const list = await trainer.http.get(`/v1/appointments?from=${date}&to=${date}`);
    expect(list.body).toMatchObject({ timezone: ZONE, today: day(0) });
    expect(list.body.appointments.map((a: { id: string }) => a.id)).toEqual([session.id]);

    const overlap = await trainer.http.post("/v1/appointments", {
      clientId,
      kind: "session",
      date,
      startTime: "07:30",
      durationMin: 60,
    });
    expect(overlap.status).toBe(409);
    expect(overlap.body).toMatchObject({
      code: "CONFLICT_APPOINTMENT",
      message: "You already have Asha Rao — Session at 7:00 AM.",
    });
    // Back to back is fine.
    await book(trainer, { clientId, date, startTime: "08:00" });
  });

  it("books a trial for a lead, moves it to trial booked and counts it, but never converts", async () => {
    const trainer = await signedInTrainer();
    const lead = (
      await trainer.http.post("/v1/leads", {
        fullName: "Ravi Kumar",
        phone: `94${String(Date.now()).slice(-8)}`,
        goal: "lose_weight",
        source: "instagram",
      })
    ).body;
    const notForLeads = await trainer.http.post("/v1/appointments", {
      leadId: lead.id,
      kind: "session",
      date: day(2),
      startTime: "18:00",
      durationMin: 60,
    });
    expect(notForLeads.body.fieldErrors.kind).toEqual(["Leads can book a trial or a consultation"]);

    const trial = await book(trainer, {
      leadId: lead.id,
      kind: "trial",
      date: day(2),
      startTime: "18:00",
      durationMin: 45,
    });
    expect(trial.person).toEqual({ kind: "lead", id: lead.id, fullName: "Ravi Kumar" });

    const detail = (await trainer.http.get(`/v1/leads/${lead.id}`)).body;
    expect(detail.stage).toBe("trial_booked");
    expect(detail.appointments).toEqual([
      { id: trial.id, kind: "trial", status: "scheduled", date: day(2), startTime: "18:00" },
    ]);
    expect(detail.activities.map((a: { type: string }) => a.type)).toEqual(
      expect.arrayContaining(["trial_booked", "stage_changed"]),
    );
    expect((await trainer.http.get("/v1/leads/summary")).body.kpis.upcomingTrials).toBe(1);

    // Recording the outcome never converts (§8.2).
    await owner.query(
      "update appointments set starts_at = now() - interval '2 hours' where id = $1",
      [trial.id],
    );
    const attended = await trainer.http.post(`/v1/appointments/${trial.id}/attendance`, {
      status: "completed",
    });
    expect(attended.body.status).toBe("completed");
    const after = (await trainer.http.get(`/v1/leads/${lead.id}`)).body;
    expect(after.stage).toBe("trial_booked");
    expect(after.activities.map((a: { type: string }) => a.type)).toContain("trial_completed");
  });
});

describe("recurring series", () => {
  it("previews conflicts per occurrence, refuses unskipped ones, and creates the rest", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const monday = nextMonday();
    const wednesday = new Date(`${monday}T00:00:00Z`);
    wednesday.setUTCDate(wednesday.getUTCDate() + 2);
    const clash = wednesday.toISOString().slice(0, 10);
    const other = await newClient(trainer, "Ravi Kumar");
    await book(trainer, { clientId: other, date: clash, startTime: "07:30" });

    const series = {
      clientId,
      kind: "session",
      weekdays: [1, 3, 5],
      startTime: "07:00",
      durationMin: 60,
      startsOn: monday,
      occurrenceCount: 24,
    };
    const preview = await trainer.http.post("/v1/appointments/series/preview", series);
    expect(preview.status).toBe(200);
    expect(preview.body.occurrences).toHaveLength(24);
    expect(preview.body.occurrences[0]).toEqual({
      date: monday,
      startTime: "07:00",
      conflict: null,
    });
    const conflicts = preview.body.occurrences.filter((o: { conflict: unknown }) => o.conflict);
    expect(conflicts).toEqual([
      {
        date: clash,
        startTime: "07:00",
        conflict: expect.objectContaining({ title: "Ravi Kumar — Session", startTime: "7:30 AM" }),
      },
    ]);

    const refused = await trainer.http.post("/v1/appointments/series", series);
    expect(refused.status).toBe(409);
    expect(refused.body.fieldErrors.skipDates).toEqual([
      `${clash}: you already have Ravi Kumar — Session at 7:30 AM`,
    ]);

    const created = await trainer.http.post("/v1/appointments/series", {
      ...series,
      skipDates: [clash],
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ created: 23, skipped: 1 });
    const { rows } = await owner.query(
      "select count(*)::int as n from appointments where series_id = $1",
      [created.body.seriesId],
    );
    expect(rows[0]?.n).toBe(23);
  });

  it("caps an open-ended date range at 52 sessions and validates the end", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const base = {
      clientId,
      kind: "session",
      weekdays: [1, 2, 3, 4, 5],
      startTime: "06:00",
      durationMin: 30,
      startsOn: nextMonday(),
    };
    const capped = await trainer.http.post("/v1/appointments/series/preview", {
      ...base,
      endsOn: day(200),
    });
    expect(capped.body.occurrences).toHaveLength(52);
    expect(capped.body.capped).toBe(true);
    const neither = await trainer.http.post("/v1/appointments/series/preview", base);
    expect(neither.body.fieldErrors.endsOn).toEqual(["Choose an end date or a number of sessions"]);
    const tooMany = await trainer.http.post("/v1/appointments/series/preview", {
      ...base,
      occurrenceCount: 60,
    });
    expect(tooMany.body.fieldErrors.occurrenceCount).toEqual(["At most 52 sessions"]);
  });

  it("changes this occurrence or this and following; past ones stay", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const created = await trainer.http.post("/v1/appointments/series", {
      clientId,
      kind: "online_session",
      weekdays: [1],
      startTime: "07:00",
      durationMin: 60,
      startsOn: nextMonday(),
      occurrenceCount: 5,
      meetingUrl: "https://meet.example.test/abc",
    });
    const { rows } = await owner.query<{ id: string }>(
      "select id from appointments where series_id = $1 order by starts_at",
      [created.body.seriesId],
    );
    const ids = rows.map((row) => row.id);
    const third = (await trainer.http.get(`/v1/appointments/${ids[2]}`)).body;

    const otherDay = await trainer.http.patch(`/v1/appointments/${ids[2]}`, {
      date: day(60),
      startTime: "08:00",
      durationMin: 45,
      scope: "following",
    });
    expect(otherDay.body.fieldErrors.date).toEqual([
      "To move a session to another day, change only this occurrence",
    ]);

    const moved = await trainer.http.patch(`/v1/appointments/${ids[2]}`, {
      date: third.date,
      startTime: "08:00",
      durationMin: 45,
      meetingUrl: "https://meet.example.test/abc",
      scope: "following",
    });
    expect(moved.status).toBe(200);
    const times = await Promise.all(
      ids.map(async (id) => (await trainer.http.get(`/v1/appointments/${id}`)).body),
    );
    expect(times.map((a) => `${a.startTime}/${a.durationMin}`)).toEqual([
      "07:00/60",
      "07:00/60",
      "08:00/45",
      "08:00/45",
      "08:00/45",
    ]);
    expect(times[3].changes[0]).toMatchObject({
      kind: "rescheduled",
      data: { scope: "following" },
    });

    // Move a single occurrence to another day.
    const single = await trainer.http.patch(`/v1/appointments/${ids[0]}`, {
      date: day(20),
      startTime: "19:00",
      durationMin: 60,
    });
    expect(single.body).toMatchObject({ date: day(20), startTime: "19:00" });

    // Cancel this and following: the series ends.
    const cancelled = await trainer.http.post(`/v1/appointments/${ids[3]}/cancel`, {
      reason: "Client moving cities",
      scope: "following",
    });
    expect(cancelled.body).toMatchObject({ status: "cancelled", lateCancel: false });
    const { rows: states } = await owner.query<{ status: string }>(
      "select status from appointments where series_id = $1 order by starts_at",
      [created.body.seriesId],
    );
    expect(states.map((row) => row.status).filter((s) => s === "cancelled")).toHaveLength(2);
    const { rows: series } = await owner.query(
      "select status from appointment_series where id = $1",
      [created.body.seriesId],
    );
    expect(series[0]?.status).toBe("ended");
  });
});

describe("cancel and attendance", () => {
  it("marks late cancels from the workspace window and keeps cancelled appointments final", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const soon = await book(trainer, { clientId, ...localIn(120) });
    const later = await book(trainer, { clientId, date: day(5), startTime: "10:00" });

    const late = await trainer.http.post(`/v1/appointments/${soon.id}/cancel`, {
      reason: "Unwell",
    });
    expect(late.body).toMatchObject({
      status: "cancelled",
      lateCancel: true,
      cancelReason: "Unwell",
    });
    const early = await trainer.http.post(`/v1/appointments/${later.id}/cancel`, {
      reason: "Travel",
    });
    expect(early.body.lateCancel).toBe(false);

    expect(
      (await trainer.http.post(`/v1/appointments/${soon.id}/attendance`, { status: "completed" }))
        .status,
    ).toBe(409);
    expect(
      (await trainer.http.post(`/v1/appointments/${soon.id}/cancel`, { reason: "again" })).status,
    ).toBe(409);
    // The freed slot can be booked again.
    await book(trainer, { clientId, date: day(5), startTime: "10:00" });
  });

  it("marks attendance only once a session has started, lists unmarked past sessions, and undoes", async () => {
    const trainer = await signedInTrainer();
    const clientId = await newClient(trainer);
    const future = await book(trainer, { clientId, date: day(4), startTime: "09:00" });
    const early = await trainer.http.post(`/v1/appointments/${future.id}/attendance`, {
      status: "completed",
    });
    expect(early.status).toBe(409);

    const past = await book(trainer, { clientId, date: day(-1), startTime: "09:00" });
    expect(past.needsAttendance).toBe(true);
    const pending = await trainer.http.get("/v1/appointments/needs-attendance");
    expect(pending.body.appointments.map((a: { id: string }) => a.id)).toEqual([past.id]);

    const attended = await trainer.http.post(`/v1/appointments/${past.id}/attendance`, {
      status: "completed",
    });
    expect(attended.body).toMatchObject({ status: "completed", needsAttendance: false });
    // Double submit is a no-op.
    const again = await trainer.http.post(`/v1/appointments/${past.id}/attendance`, {
      status: "completed",
    });
    expect(
      again.body.changes.filter((c: { kind: string }) => c.kind === "attendance"),
    ).toHaveLength(1);
    expect((await trainer.http.get("/v1/appointments/needs-attendance")).body.appointments).toEqual(
      [],
    );

    const noShow = await trainer.http.post(`/v1/appointments/${past.id}/attendance`, {
      status: "no_show",
    });
    expect(noShow.body.status).toBe("no_show");
    const undone = await trainer.http.post(`/v1/appointments/${past.id}/attendance`, {
      status: "scheduled",
    });
    expect(undone.body).toMatchObject({ status: "scheduled", needsAttendance: true });
    expect(undone.body.changes[0]).toMatchObject({
      kind: "attendance",
      data: { from: "no_show", to: "scheduled" },
    });

    const noted = await trainer.http.put(`/v1/appointments/${past.id}/notes`, {
      notes: "Squat 60 kg x 5, felt strong",
    });
    expect(noted.body.notes).toBe("Squat 60 kg x 5, felt strong");
  });
});

describe("access", () => {
  it("can't see or change another trainer's appointments, clients or leads (tampering)", async () => {
    const a = await signedInTrainer();
    const b = await signedInTrainer();
    const clientA = await newClient(a);
    const session = await book(a, { clientId: clientA, date: day(6), startTime: "11:00" });
    const leadA = (
      await a.http.post("/v1/leads", {
        fullName: "L",
        phone: `93${String(Date.now()).slice(-8)}`,
        goal: "other",
        source: "other",
      })
    ).body;

    expect((await b.http.get(`/v1/appointments/${session.id}`)).status).toBe(404);
    expect(
      (
        await b.http.patch(`/v1/appointments/${session.id}`, {
          date: day(6),
          startTime: "12:00",
          durationMin: 60,
        })
      ).status,
    ).toBe(404);
    expect(
      (await b.http.post(`/v1/appointments/${session.id}/cancel`, { reason: "x" })).status,
    ).toBe(404);
    expect(
      (await b.http.post(`/v1/appointments/${session.id}/attendance`, { status: "no_show" }))
        .status,
    ).toBe(404);
    expect((await b.http.put(`/v1/appointments/${session.id}/notes`, { notes: "x" })).status).toBe(
      404,
    );
    const foreignClient = await b.http.post("/v1/appointments", {
      clientId: clientA,
      kind: "session",
      date: day(6),
      startTime: "15:00",
      durationMin: 60,
    });
    expect(foreignClient.body.fieldErrors.clientId).toEqual(["That client doesn't exist"]);
    expect(
      (
        await b.http.post("/v1/appointments", {
          leadId: leadA.id,
          kind: "trial",
          date: day(6),
          startTime: "15:00",
          durationMin: 60,
        })
      ).status,
    ).toBe(404);
    expect(
      (await b.http.get(`/v1/appointments?from=${day(6)}&to=${day(6)}`)).body.appointments,
    ).toEqual([]);
    expect((await b.http.get("/v1/clients/options")).body.clients).toEqual([]);
    // B's calendar doesn't conflict with A's.
    await book(b, { clientId: await newClient(b), date: day(6), startTime: "11:00" });
  });

  it("limits the calendar range", async () => {
    const trainer = await signedInTrainer();
    const response = await trainer.http.get(`/v1/appointments?from=${day(0)}&to=${day(60)}`);
    expect(response.status).toBe(400);
  });
});
