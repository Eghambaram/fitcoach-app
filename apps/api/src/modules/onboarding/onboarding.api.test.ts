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

let counter = 0;
const uniquePhone = () =>
  `97${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`;

/** Only what's required: name, primary goal, mode and the data-processing consent. */
const REQUIRED = {
  fullName: "Asha Rao",
  primaryGoal: "build_muscle",
  trainingMode: "in_person",
  consentDataProcessing: true,
  units: { weightUnit: "kg", lengthUnit: "cm" },
};

function finalize(trainer: SignedIn, body: object, key = randomUUID()) {
  return trainer.http.post("/v1/onboarding/finalize", body).set("Idempotency-Key", key);
}

async function workspaceOf(trainer: SignedIn): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    "select w.id from workspaces w join users u on u.id = w.owner_user_id where u.email = $1",
    [trainer.email],
  );
  return rows[0]?.id ?? "";
}

async function clientRecord(clientId: string) {
  const {
    rows: [client],
  } = await owner.query("select * from clients where id = $1", [clientId]);
  const { rows: goals } = await owner.query(
    "select kind, goal from client_goals where client_id = $1 order by kind, goal",
    [clientId],
  );
  const { rows: consents } = await owner.query(
    "select kind, status, notice_version, source, actor_kind from client_consents where client_id = $1 order by kind",
    [clientId],
  );
  const { rows: measured } = await owner.query(
    `select t.key, m.value::float as value, m.measured_on::text as measured_on, m.source
     from measurements m join measurement_types t on t.id = m.type_id
     where m.client_id = $1 order by t.sort_order`,
    [clientId],
  );
  return { client, goals, consents, measured };
}

describe("drafts", () => {
  it("saves halfway, lists and resumes the draft, and creates the client with only the required fields", async () => {
    const trainer = await signedInTrainer();
    const created = await trainer.http.post("/v1/onboarding/drafts", {
      step: 1,
      data: { fullName: "Asha", email: "not-yet-an-email" },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      clientId: null,
      step: 1,
      data: { fullName: "Asha", email: "not-yet-an-email" },
      units: { weightUnit: "kg", lengthUnit: "cm" },
    });
    const draftId = created.body.id;

    const listed = await trainer.http.get("/v1/onboarding/drafts");
    expect(listed.body.drafts).toEqual([
      expect.objectContaining({ id: draftId, fullName: "Asha", step: 1 }),
    ]);

    const saved = await trainer.http.put(`/v1/onboarding/drafts/${draftId}`, {
      step: 2,
      data: { fullName: "Asha Rao", primaryGoal: "build_muscle" },
    });
    expect(saved.body).toMatchObject({ step: 2, data: { fullName: "Asha Rao" } });
    expect((await trainer.http.get(`/v1/onboarding/drafts/${draftId}`)).body.step).toBe(2);

    const done = await finalize(trainer, { ...REQUIRED, draftId });
    expect(done.status).toBe(201);
    expect(done.body).toEqual({
      clientId: expect.any(String),
      fullName: "Asha Rao",
      measurementsRecorded: 0,
      hasPhone: false,
    });

    const record = await clientRecord(done.body.clientId);
    expect(record.client).toMatchObject({
      status: "active",
      full_name: "Asha Rao",
      goal: "build_muscle",
      training_mode: "in_person",
      source_lead_id: null,
    });
    expect(record.client.onboarded_at).not.toBeNull();
    expect(record.goals).toEqual([{ kind: "primary", goal: "build_muscle" }]);
    expect(record.consents).toEqual([
      {
        kind: "data_processing",
        status: "granted",
        notice_version: 1,
        source: "onboarding",
        actor_kind: "trainer",
      },
      {
        kind: "progress_photos",
        status: "declined",
        notice_version: 1,
        source: "onboarding",
        actor_kind: "trainer",
      },
    ]);
    expect(record.measured).toEqual([]);

    // The draft is finished: gone from the list, and can't be changed or used again.
    expect((await trainer.http.get("/v1/onboarding/drafts")).body.drafts).toEqual([]);
    expect((await trainer.http.get(`/v1/onboarding/drafts/${draftId}`)).status).toBe(409);
    expect(
      (await trainer.http.put(`/v1/onboarding/drafts/${draftId}`, { step: 3, data: {} })).status,
    ).toBe(409);
    expect((await finalize(trainer, { ...REQUIRED, fullName: "Other", draftId })).status).toBe(409);

    const { rows } = await owner.query("select type from activity_events where client_id = $1", [
      done.body.clientId,
    ]);
    expect(rows).toEqual([{ type: "client_onboarded" }]);
  });

  it("validates the required fields and consent, phone numbers and plausible measurements", async () => {
    const trainer = await signedInTrainer();
    const missing = await finalize(trainer, {
      units: REQUIRED.units,
      consentDataProcessing: false,
    });
    expect(missing.status).toBe(400);
    expect(Object.keys(missing.body.fieldErrors).sort()).toEqual([
      "consentDataProcessing",
      "fullName",
      "primaryGoal",
      "trainingMode",
    ]);
    const badPhone = await finalize(trainer, { ...REQUIRED, phone: "12" });
    expect(badPhone.body.fieldErrors.phone).toEqual(["Enter a valid phone number"]);
    const typo = await finalize(trainer, { ...REQUIRED, weight: 725 });
    expect(typo.status).toBe(400);
    expect(typo.body.fieldErrors.weight).toEqual(["Check the weight: it looks out of range"]);
    // Nothing was created by the refused attempts.
    const { rows } = await owner.query(
      "select count(*)::int as n from clients where workspace_id = $1",
      [await workspaceOf(trainer)],
    );
    expect(rows[0]?.n).toBe(0);
  });
});

describe("from a converted lead", () => {
  it("prefills from the lead, stores baseline in canonical units, and activates the same client", async () => {
    const trainer = await signedInTrainer();
    const lead = (
      await trainer.http.post("/v1/leads", {
        fullName: "Kiran Rao",
        phone: uniquePhone(),
        goal: "lose_weight",
        source: "instagram",
        trainingMode: "online",
        location: "Pune",
      })
    ).body;
    const { clientId } = (
      await trainer.http
        .post(`/v1/leads/${lead.id}/convert`, {})
        .set("Idempotency-Key", randomUUID())
    ).body;

    const prefill = await trainer.http.get(`/v1/onboarding/from-lead/${lead.id}`);
    expect(prefill.body).toMatchObject({
      status: "onboarding",
      clientId,
      fullName: "Kiran Rao",
      draft: {
        id: null,
        clientId,
        step: 1,
        data: {
          fullName: "Kiran Rao",
          phone: lead.phoneE164,
          primaryGoal: "lose_weight",
          trainingMode: "online",
          location: "Pune",
        },
      },
    });

    // Saving once and saving again continues the same draft.
    const first = await trainer.http.post("/v1/onboarding/drafts", {
      clientId,
      step: 2,
      data: { ...prefill.body.draft.data, experience: "beginner" },
    });
    const second = await trainer.http.post("/v1/onboarding/drafts", {
      clientId,
      step: 3,
      data: { ...prefill.body.draft.data, experience: "intermediate" },
    });
    expect(second.body.id).toBe(first.body.id);
    expect((await trainer.http.get(`/v1/onboarding/from-lead/${lead.id}`)).body.draft.id).toBe(
      first.body.id,
    );

    const done = await finalize(trainer, {
      ...REQUIRED,
      fullName: "Kiran Rao",
      phone: lead.phoneE164,
      primaryGoal: "lose_weight",
      secondaryGoals: ["get_stronger", "lose_weight", "get_stronger"],
      trainingMode: "online",
      clientId,
      measuredOn: "2026-10-20",
      weight: 165,
      height: 68,
      waist: 34,
      body_fat: 24.5,
      consentProgressPhotos: true,
      limitations: "Old knee injury",
      units: { weightUnit: "lb", lengthUnit: "in" },
    });
    expect(done.status).toBe(201);
    expect(done.body).toEqual({
      clientId,
      fullName: "Kiran Rao",
      measurementsRecorded: 4,
      hasPhone: true,
    });

    const record = await clientRecord(clientId);
    expect(record.client).toMatchObject({
      status: "active",
      source_lead_id: lead.id,
      limitations: "Old knee injury",
    });
    expect(record.goals).toEqual([
      { kind: "primary", goal: "lose_weight" },
      { kind: "secondary", goal: "get_stronger" },
    ]);
    expect(record.consents.map((consent: { status: string }) => consent.status)).toEqual([
      "granted",
      "granted",
    ]);
    expect(record.measured).toEqual([
      { key: "weight", value: 74.84, measured_on: "2026-10-20", source: "trainer" },
      { key: "height", value: 172.72, measured_on: "2026-10-20", source: "trainer" },
      { key: "body_fat", value: 24.5, measured_on: "2026-10-20", source: "trainer" },
      { key: "waist", value: 86.36, measured_on: "2026-10-20", source: "trainer" },
    ]);

    // The saved draft was finished too, and the lead now reports the client as onboarded.
    expect((await trainer.http.get("/v1/onboarding/drafts")).body.drafts).toEqual([]);
    expect((await trainer.http.get(`/v1/onboarding/from-lead/${lead.id}`)).body).toEqual({
      status: "onboarded",
      clientId,
      fullName: "Kiran Rao",
      draft: null,
    });
  });

  it("asks to convert first for a lead that isn't converted", async () => {
    const trainer = await signedInTrainer();
    const lead = (
      await trainer.http.post("/v1/leads", {
        fullName: "Ravi",
        phone: uniquePhone(),
        goal: "other",
        source: "other",
      })
    ).body;
    const response = await trainer.http.get(`/v1/onboarding/from-lead/${lead.id}`);
    expect(response.status).toBe(409);
    expect(response.body.message).toBe("Convert this lead to a client first.");
  });
});

describe("finalize rules", () => {
  it("replays the same Idempotency-Key with one client", async () => {
    const trainer = await signedInTrainer();
    const key = randomUUID();
    const [first, second] = await Promise.all([
      finalize(trainer, REQUIRED, key),
      finalize(trainer, REQUIRED, key),
    ]);
    expect(first.status).toBe(201);
    expect(second.body).toEqual(first.body);
    const { rows } = await owner.query(
      "select count(*)::int as n from clients where workspace_id = $1",
      [await workspaceOf(trainer)],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it("says who already uses the phone number", async () => {
    const trainer = await signedInTrainer();
    const phone = uniquePhone();
    await finalize(trainer, { ...REQUIRED, phone });
    const duplicate = await finalize(trainer, { ...REQUIRED, fullName: "Someone Else", phone });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({
      code: "CONFLICT_DUPLICATE",
      message: "Asha Rao is already a client with this phone or email.",
      fieldErrors: { phone: ["Already used by another client"] },
    });
  });

  it("refuses past the plan's limit and leaves the draft open", async () => {
    const trainer = await signedInTrainer();
    await owner.query("update workspace_plans set max_active_clients = 1 where workspace_id = $1", [
      await workspaceOf(trainer),
    ]);
    await finalize(trainer, REQUIRED);
    const draft = (
      await trainer.http.post("/v1/onboarding/drafts", { step: 4, data: { fullName: "Second" } })
    ).body;
    const refused = await finalize(trainer, { ...REQUIRED, fullName: "Second", draftId: draft.id });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("PLAN_LIMIT");
    expect((await trainer.http.get(`/v1/onboarding/drafts/${draft.id}`)).status).toBe(200);
  });
});

describe("access", () => {
  it("can't read, save or use another trainer's drafts, clients or leads (tampering)", async () => {
    const a = await signedInTrainer();
    const b = await signedInTrainer();
    const draft = (
      await a.http.post("/v1/onboarding/drafts", { step: 1, data: { fullName: "A's" } })
    ).body;
    const lead = (
      await a.http.post("/v1/leads", {
        fullName: "L",
        phone: uniquePhone(),
        goal: "other",
        source: "other",
      })
    ).body;
    const { clientId } = (
      await a.http.post(`/v1/leads/${lead.id}/convert`, {}).set("Idempotency-Key", randomUUID())
    ).body;

    expect((await b.http.get(`/v1/onboarding/drafts/${draft.id}`)).status).toBe(404);
    expect(
      (await b.http.put(`/v1/onboarding/drafts/${draft.id}`, { step: 2, data: {} })).status,
    ).toBe(404);
    expect((await b.http.get(`/v1/onboarding/from-lead/${lead.id}`)).status).toBe(404);
    expect((await finalize(b, { ...REQUIRED, draftId: draft.id })).status).toBe(404);
    const foreignClient = await finalize(b, { ...REQUIRED, clientId });
    expect(foreignClient.status).toBe(400);
    expect(foreignClient.body.fieldErrors.clientId).toEqual(["That client doesn't exist"]);
    expect(
      (await b.http.post("/v1/onboarding/drafts", { clientId, step: 1, data: {} })).status,
    ).toBe(400);
    expect((await b.http.get("/v1/onboarding/drafts")).body.drafts).toEqual([]);
    expect((await clientRecord(clientId)).client.status).toBe("onboarding_draft");
  });
});
