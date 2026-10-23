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
  `98${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`;

async function addLead(trainer: SignedIn, overrides: Record<string, unknown> = {}) {
  const response = await trainer.http.post("/v1/leads", {
    fullName: "Meena Singh",
    phone: uniquePhone(),
    goal: "lose_weight",
    source: "instagram",
    trainingMode: "online",
    location: "Pune",
    campaign: "diwali",
    ...overrides,
  });
  expect(response.status).toBe(201);
  return response.body as { id: string; phoneE164: string };
}

function convert(trainer: SignedIn, leadId: string, body: object = {}, key = randomUUID()) {
  return trainer.http.post(`/v1/leads/${leadId}/convert`, body).set("Idempotency-Key", key);
}

async function workspaceOf(trainer: SignedIn): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    "select w.id from workspaces w join users u on u.id = w.owner_user_id where u.email = $1",
    [trainer.email],
  );
  return rows[0]?.id ?? "";
}

async function clientsFor(leadId: string) {
  const { rows } = await owner.query(
    "select * from clients where source_lead_id = $1 order by created_at",
    [leadId],
  );
  return rows;
}

describe("lead → client conversion", () => {
  it("creates an onboarding client with the lead's details and attribution, and keeps the history", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer, { email: "meena@example.test" });
    await trainer.http.post(`/v1/leads/${lead.id}/notes`, { body: "Prefers mornings" });
    await trainer.http.post(`/v1/leads/${lead.id}/follow-ups`, {
      actionType: "call",
      dueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
        new Date(Date.now() + 86_400_000),
      ),
      dueTime: "10:00",
    });

    const response = await convert(trainer, lead.id, { coachingStartOn: "2026-11-02" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      clientId: expect.any(String),
      linkedExisting: false,
      next: `/app/clients/new?fromLead=${lead.id}`,
    });

    const [client] = await clientsFor(lead.id);
    expect(client).toMatchObject({
      id: response.body.clientId,
      status: "onboarding_draft",
      full_name: "Meena Singh",
      phone_e164: lead.phoneE164,
      email: "meena@example.test",
      goal: "lose_weight",
      training_mode: "online",
      location: "Pune",
      source: "instagram",
      campaign: "diwali",
    });

    const detail = (await trainer.http.get(`/v1/leads/${lead.id}`)).body;
    expect(detail).toMatchObject({
      stage: "converted",
      convertedClientId: response.body.clientId,
      nextFollowUpAt: null,
    });
    expect(detail.convertedAt).not.toBeNull();
    expect(detail.notes).toHaveLength(1);
    const types = detail.activities.map((entry: { type: string }) => entry.type);
    expect(types).toEqual(
      expect.arrayContaining(["converted", "stage_changed", "follow_up_skipped", "created"]),
    );
    expect(detail.followUps[0]).toMatchObject({ status: "skipped" });

    const { rows: events } = await owner.query(
      "select type, data from activity_events where lead_id = $1",
      [lead.id],
    );
    expect(events).toEqual([{ type: "lead_converted", data: { linked: false } }]);
    const { rows: product } = await owner.query(
      "select properties from product_events where event = 'lead_converted' and workspace_id = $1",
      [await workspaceOf(trainer)],
    );
    expect(product).toEqual([{ properties: { linked: false, source: "instagram" } }]);
  });

  it("replays the same Idempotency-Key and refuses it for a different request", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    const key = randomUUID();
    const first = await convert(trainer, lead.id, {}, key);
    const again = await convert(trainer, lead.id, {}, key);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    const changed = await convert(trainer, lead.id, { coachingStartOn: "2026-12-01" }, key);
    expect(changed.status).toBe(422);
    expect(changed.body.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await clientsFor(lead.id)).toHaveLength(1);
  });

  it("creates exactly one client under concurrent double-submits", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    const key = randomUUID();
    const responses = await Promise.all([
      convert(trainer, lead.id, {}, key),
      convert(trainer, lead.id, {}, key),
      convert(trainer, lead.id),
      convert(trainer, lead.id),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200]);
    const ids = new Set(responses.map((response) => response.body.clientId));
    expect(ids.size).toBe(1);
    expect(await clientsFor(lead.id)).toHaveLength(1);
    const { rows } = await owner.query(
      "select count(*)::int as n from lead_activities where lead_id = $1 and type = 'converted'",
      [lead.id],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it("rolls everything back when a step fails, so the lead is never converted without a client", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    // Make the last write of the transaction fail for this lead only.
    await owner.query(`
      create function pg_temp_fail_conversion() returns trigger language plpgsql as $$
      begin
        if new.lead_id = '${lead.id}' then raise exception 'forced failure'; end if;
        return new;
      end $$;
      create trigger fail_conversion before insert on activity_events
        for each row execute function pg_temp_fail_conversion();`);
    try {
      const failed = await convert(trainer, lead.id);
      expect(failed.status).toBe(500);
      expect(failed.body.code).toBe("INTERNAL_ERROR");
    } finally {
      await owner.query(
        "drop trigger fail_conversion on activity_events; drop function pg_temp_fail_conversion();",
      );
    }
    expect(await clientsFor(lead.id)).toHaveLength(0);
    const detail = (await trainer.http.get(`/v1/leads/${lead.id}`)).body;
    expect(detail).toMatchObject({ stage: "new", convertedClientId: null });

    // Nothing was half-done, so it converts cleanly afterwards.
    expect((await convert(trainer, lead.id)).status).toBe(200);
  });

  it("refuses past the plan's client limit and leaves the lead as it was", async () => {
    const trainer = await signedInTrainer();
    await owner.query("update workspace_plans set max_active_clients = 1 where workspace_id = $1", [
      await workspaceOf(trainer),
    ]);
    const first = await addLead(trainer);
    const second = await addLead(trainer, { fullName: "Ravi Kumar" });
    expect((await convert(trainer, first.id)).status).toBe(200);
    const refused = await convert(trainer, second.id);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("PLAN_LIMIT");
    expect(refused.body.message).toContain("Your plan allows 1 active clients");
    expect((await trainer.http.get(`/v1/leads/${second.id}`)).body.stage).toBe("new");
  });

  it("offers linking when the contact is already a client, and links without a new client", async () => {
    const trainer = await signedInTrainer();
    const original = await addLead(trainer);
    const { clientId } = (await convert(trainer, original.id)).body;
    // The same person enquires again.
    const again = await addLead(trainer, { phone: original.phoneE164, fullName: "Meena S" });

    const duplicates = await trainer.http.post("/v1/leads/duplicates", {
      phone: original.phoneE164,
      excludeLeadId: again.id,
    });
    expect(duplicates.body.matches).toEqual(
      expect.arrayContaining([
        {
          kind: "client",
          id: clientId,
          fullName: "Meena Singh",
          status: "onboarding_draft",
          matchedOn: ["phone"],
        },
      ]),
    );

    const refused = await convert(trainer, again.id);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      code: "CONFLICT_DUPLICATE",
      fieldErrors: { linkClientId: [clientId] },
    });

    const linked = await convert(trainer, again.id, { linkClientId: clientId });
    expect(linked.body).toEqual({
      clientId,
      linkedExisting: true,
      next: `/app/leads?lead=${again.id}`,
    });
    expect(await clientsFor(again.id)).toHaveLength(0);
    expect((await trainer.http.get(`/v1/leads/${again.id}`)).body.convertedClientId).toBe(clientId);
  });

  it("makes a converted lead final", async () => {
    const trainer = await signedInTrainer();
    const lead = await addLead(trainer);
    await convert(trainer, lead.id);
    const body = { fullName: "x", phone: lead.phoneE164, goal: "other", source: "other" };
    expect((await trainer.http.patch(`/v1/leads/${lead.id}`, body)).status).toBe(409);
    expect((await trainer.http.post(`/v1/leads/${lead.id}/stage`, { stage: "new" })).status).toBe(
      409,
    );
    expect((await trainer.http.post(`/v1/leads/${lead.id}/archive`)).status).toBe(409);
    expect(
      (
        await trainer.http.post(`/v1/leads/${lead.id}/contacts`, {
          channel: "call",
          outcome: "spoke",
        })
      ).status,
    ).toBe(409);
    expect((await trainer.http.delete(`/v1/leads/${lead.id}`)).status).toBe(409);
  });
});

describe("access", () => {
  it("can't convert another trainer's lead or link another trainer's client (tampering)", async () => {
    const a = await signedInTrainer();
    const b = await signedInTrainer();
    const leadA = await addLead(a);
    const leadB = await addLead(b);
    const { clientId: clientB } = (await convert(b, leadB.id)).body;

    expect((await convert(b, leadA.id)).status).toBe(404);
    const foreign = await convert(a, leadA.id, { linkClientId: clientB });
    expect(foreign.status).toBe(400);
    expect(foreign.body.fieldErrors.linkClientId).toEqual(["That client doesn't exist"]);
    expect((await a.http.get(`/v1/leads/${leadA.id}`)).body.stage).toBe("new");
    // B's client never shows up as A's duplicate.
    const duplicates = await a.http.post("/v1/leads/duplicates", { phone: leadB.phoneE164 });
    expect(duplicates.body.matches).toEqual([]);
  });

  it("refuses archived leads and suspended workspaces", async () => {
    const trainer = await signedInTrainer();
    const archived = await addLead(trainer);
    await trainer.http.post(`/v1/leads/${archived.id}/archive`);
    expect((await convert(trainer, archived.id)).status).toBe(409);

    const lead = await addLead(trainer);
    const workspaceId = await workspaceOf(trainer);
    await owner.query("update workspaces set status = 'suspended' where id = $1", [workspaceId]);
    try {
      const refused = await convert(trainer, lead.id);
      expect(refused.status).toBe(403);
      expect(refused.body.code).toBe("WORKSPACE_READ_ONLY");
    } finally {
      await owner.query("update workspaces set status = 'active' where id = $1", [workspaceId]);
    }
  });
});
