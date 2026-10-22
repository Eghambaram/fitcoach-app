import type { INestApplication } from "@nestjs/common";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";

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

const LEAD = {
  fullName: "Meena Singh",
  phone: "98123 45678",
  goal: "lose_weight",
  source: "walk_in",
};

async function addLead(trainer: SignedIn, overrides: Record<string, unknown> = {}) {
  const response = await trainer.http.post("/v1/leads", { ...LEAD, ...overrides });
  expect(response.status).toBe(201);
  return response.body as { id: string; [key: string]: unknown };
}

describe("add lead", () => {
  it("normalises the phone, records the creation and an optional first note", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer, {
      email: " Meena@Example.TEST ",
      trainingMode: "online",
      location: "Pune",
      note: "Met at the gym, prefers mornings",
    });

    expect(lead).toMatchObject({
      fullName: "Meena Singh",
      phoneE164: "+919812345678",
      email: "meena@example.test",
      stage: "new",
      createdVia: "manual",
      trainingMode: "online",
      location: "Pune",
      consent: null,
      canDelete: false,
    });
    expect(lead.notes).toEqual([
      expect.objectContaining({ body: "Met at the gym, prefers mornings" }),
    ]);
    expect(lead.activities).toEqual([
      expect.objectContaining({
        type: "created",
        actorKind: "trainer",
        data: { source: "walk_in" },
      }),
    ]);
  });

  it("needs a phone or an email, and a valid phone", async () => {
    const trainer = await signedInTrainer();
    const noContact = await trainer.http.post("/v1/leads", { ...LEAD, phone: "" });
    expect(noContact.status).toBe(400);
    expect(noContact.body.fieldErrors.phone).toEqual(["Add a phone number or an email"]);

    const badPhone = await trainer.http.post("/v1/leads", { ...LEAD, phone: "12" });
    expect(badPhone.body.fieldErrors.phone).toEqual(["Enter a valid phone number"]);
  });
});

describe("duplicate check", () => {
  it("finds a match on the normalised phone or the email, but not the lead itself", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer, { email: "meena@example.test" });

    const byPhone = await trainer.http.post("/v1/leads/duplicates", { phone: "+91 98123-45678" });
    expect(byPhone.body.matches).toEqual([
      { kind: "lead", id: lead.id, fullName: "Meena Singh", stage: "new", matchedOn: ["phone"] },
    ]);
    const byEmail = await trainer.http.post("/v1/leads/duplicates", {
      email: "MEENA@example.test",
    });
    expect(byEmail.body.matches[0].matchedOn).toEqual(["email"]);
    const self = await trainer.http.post("/v1/leads/duplicates", {
      phone: "9812345678",
      excludeLeadId: lead.id,
    });
    expect(self.body.matches).toEqual([]);
  });

  it("never reports another trainer's leads", async () => {
    const a = await signedInTrainer();
    const b = await signedInTrainer();
    await addLead(a);
    const response = await b.http.post("/v1/leads/duplicates", { phone: LEAD.phone });
    expect(response.body.matches).toEqual([]);
  });
});

describe("list, search, filters, pagination and counts", () => {
  it("filters, searches and pages through leads", async () => {
    const trainer = await signedInTrainer();
    await addLead(trainer, {
      fullName: "Asha Rao",
      phone: "9800000001",
      source: "instagram",
      trainingMode: "online",
    });
    await addLead(trainer, { fullName: "Bhavna Iyer", phone: "9800000002", goal: "build_muscle" });
    const ravi = await addLead(trainer, {
      fullName: "Ravi Kumar",
      phone: "9800000003",
      source: "referral",
    });
    await trainer.http.post(`/v1/leads/${ravi.id}/stage`, { stage: "contacted" });

    const names = (body: { items: { fullName: string }[] }) =>
      body.items.map((item) => item.fullName);
    expect(names((await trainer.http.get("/v1/leads?sort=name")).body)).toEqual([
      "Asha Rao",
      "Bhavna Iyer",
      "Ravi Kumar",
    ]);
    expect(names((await trainer.http.get("/v1/leads?source=instagram")).body)).toEqual([
      "Asha Rao",
    ]);
    expect(names((await trainer.http.get("/v1/leads?mode=online")).body)).toEqual(["Asha Rao"]);
    expect(names((await trainer.http.get("/v1/leads?stage=contacted")).body)).toEqual([
      "Ravi Kumar",
    ]);
    expect(names((await trainer.http.get("/v1/leads?q=bhav")).body)).toEqual(["Bhavna Iyer"]);
    expect(names((await trainer.http.get("/v1/leads?q=0003")).body)).toEqual(["Ravi Kumar"]);
    expect(
      names((await trainer.http.get(`/v1/leads?q=${encodeURIComponent("build muscle")}`)).body),
    ).toEqual(["Bhavna Iyer"]);
    expect(names((await trainer.http.get("/v1/leads?q=referral")).body)).toEqual(["Ravi Kumar"]);
    expect(names((await trainer.http.get("/v1/leads?q=%25")).body)).toEqual([]);

    const first = await trainer.http.get("/v1/leads?sort=name&limit=2");
    expect(names(first.body)).toEqual(["Asha Rao", "Bhavna Iyer"]);
    const second = await trainer.http.get(
      `/v1/leads?sort=name&limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`,
    );
    expect(names(second.body)).toEqual(["Ravi Kumar"]);
    expect(second.body.nextCursor).toBeNull();

    const bad = await trainer.http.get("/v1/leads?cursor=not-a-cursor");
    expect(bad.status).toBe(400);
  });

  it("counts per stage under the filters, and the workspace KPIs", async () => {
    const trainer = await signedInTrainer();
    await addLead(trainer, { phone: "9800000011" });
    const lost = await addLead(trainer, { phone: "9800000012", source: "instagram" });
    await trainer.http.post(`/v1/leads/${lost.id}/stage`, { stage: "lost", lostReason: "price" });

    const all = await trainer.http.get("/v1/leads/summary");
    expect(all.body).toEqual({
      stageCounts: {
        all: 2,
        new: 1,
        contacted: 0,
        trial_booked: 0,
        interested: 0,
        converted: 0,
        lost: 1,
      },
      kpis: { open: 1, newThisWeek: 2, fromPublicPage30Days: 0 },
    });
    const filtered = await trainer.http.get("/v1/leads/summary?source=instagram");
    expect(filtered.body.stageCounts).toMatchObject({ all: 1, lost: 1, new: 0 });
  });

  it("keeps archived leads out of the list until asked for", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    await trainer.http.post(`/v1/leads/${lead.id}/archive`);
    expect((await trainer.http.get("/v1/leads")).body.items).toEqual([]);
    expect((await trainer.http.get("/v1/leads?archived=true")).body.items).toHaveLength(1);
    await trainer.http.post(`/v1/leads/${lead.id}/restore`);
    expect((await trainer.http.get("/v1/leads")).body.items).toHaveLength(1);
  });
});

describe("edit, stage, notes", () => {
  it("logs which fields changed, never their values", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    const updated = await trainer.http.patch(`/v1/leads/${lead.id}`, {
      ...LEAD,
      fullName: "Meena S.",
      referrer: "Priya",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.activities[0]).toMatchObject({
      type: "details_updated",
      data: { fields: ["fullName", "referrer"] },
    });
  });

  it("changes stage with a timeline entry, requires a lost reason, and never sets converted", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);

    const contacted = await trainer.http.post(`/v1/leads/${lead.id}/stage`, { stage: "contacted" });
    expect(contacted.body.stage).toBe("contacted");
    expect(contacted.body.activities[0]).toMatchObject({
      type: "stage_changed",
      data: { from: "new", to: "contacted" },
    });

    const noReason = await trainer.http.post(`/v1/leads/${lead.id}/stage`, { stage: "lost" });
    expect(noReason.body.fieldErrors.lostReason).toEqual(["Choose why the lead was lost"]);

    const lost = await trainer.http.post(`/v1/leads/${lead.id}/stage`, {
      stage: "lost",
      lostReason: "timing",
      nurtureUntil: "2027-01-15",
    });
    expect(lost.body).toMatchObject({
      stage: "lost",
      lostReason: "timing",
      nurtureUntil: "2027-01-15",
    });

    const reopened = await trainer.http.post(`/v1/leads/${lead.id}/stage`, { stage: "interested" });
    expect(reopened.body).toMatchObject({
      stage: "interested",
      lostReason: null,
      nurtureUntil: null,
    });

    const converted = await trainer.http.post(`/v1/leads/${lead.id}/stage`, { stage: "converted" });
    expect(converted.status).toBe(400);
  });

  it("keeps notes separate from the activity timeline", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    const noted = await trainer.http.post(`/v1/leads/${lead.id}/notes`, {
      body: "Knee injury in 2023",
    });
    expect(noted.body.notes).toEqual([expect.objectContaining({ body: "Knee injury in 2023" })]);
    expect(noted.body.activities.map((a: { type: string }) => a.type)).toEqual(["created"]);
  });
});

describe("delete or archive", () => {
  it("deletes an untouched lead, but asks to archive one with history", async () => {
    const trainer = await signedInTrainer();
    const untouched = await addLead(trainer, { phone: "9800000021" });
    expect((await trainer.http.delete(`/v1/leads/${untouched.id}`)).status).toBe(200);
    expect((await trainer.http.get(`/v1/leads/${untouched.id}`)).status).toBe(404);

    const touched = await addLead(trainer, { phone: "9800000022" });
    await trainer.http.post(`/v1/leads/${touched.id}/notes`, { body: "Called, no answer" });
    const refused = await trainer.http.delete(`/v1/leads/${touched.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      code: "CONFLICT_STATE",
      message: "This lead has history, so it can't be deleted. Archive it instead.",
    });
  });
});

describe("CSV export", () => {
  it("exports the filtered leads with a BOM and neutralised formulas", async () => {
    const trainer = await signedInTrainer();
    await addLead(trainer, { fullName: '=HYPERLINK("x")', phone: "9800000031" });
    await addLead(trainer, { fullName: "Asha Rao", phone: "9800000032", source: "instagram" });

    const response = await trainer.http.get("/v1/leads/export.csv?source=walk_in").buffer(true);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers["content-disposition"]).toMatch(
      /^attachment; filename="leads-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const text = Buffer.isBuffer(response.body)
      ? response.body.toString("utf8")
      : String(response.text);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split("\r\n");
    expect(lines[0]).toContain('"Name","Phone","Email"');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"\'=HYPERLINK(""x"")"');
    expect(lines[1]).toContain('"+919800000031"');
  });
});

describe("access", () => {
  it("can't read or change another trainer's lead (tampering)", async () => {
    const a = await signedInTrainer();
    const b = await signedInTrainer();
    const lead = await addLead(a);

    expect((await b.http.get(`/v1/leads/${lead.id}`)).status).toBe(404);
    expect((await b.http.patch(`/v1/leads/${lead.id}`, LEAD)).status).toBe(404);
    expect((await b.http.post(`/v1/leads/${lead.id}/stage`, { stage: "contacted" })).status).toBe(
      404,
    );
    expect((await b.http.post(`/v1/leads/${lead.id}/notes`, { body: "x" })).status).toBe(404);
    expect((await b.http.delete(`/v1/leads/${lead.id}`)).status).toBe(404);
    expect((await b.http.get("/v1/leads")).body.items).toEqual([]);
    expect((await a.http.get(`/v1/leads/${lead.id}`)).body.stage).toBe("new");
  });

  it("needs a session, and keeps a suspended workspace read-only (export still works)", async () => {
    expect((await client().get("/v1/leads")).status).toBe(401);

    const trainer = await signedInTrainer();
    await addLead(trainer);
    const { rows } = await owner.query<{ id: string }>(
      "select w.id from workspaces w join users u on u.id = w.owner_user_id where u.email = $1",
      [trainer.email],
    );
    await owner.query("update workspaces set status = 'suspended' where id = $1", [rows[0]?.id]);
    expect((await trainer.http.get("/v1/leads")).status).toBe(200);
    expect((await trainer.http.get("/v1/leads/export.csv")).status).toBe(200);
    const write = await trainer.http.post("/v1/leads", { ...LEAD, phone: "9800000041" });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe("WORKSPACE_READ_ONLY");
  });
});
