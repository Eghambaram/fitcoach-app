import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { CreateInviteResponse } from "@fitcoach/shared";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import type { Tx } from "../../db/database";
import { drizzleFor } from "../../test/fixtures";
import { createHttpHelpers } from "../../test/http-helpers";
import { deleteClientData, deleteLeadData } from "./data-deletion";

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

let counter = 0;
const phone = () => `98${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`;
const operator = "cli:test";

/** As the CLI does it: the owner role, one transaction. */
const asOwner = <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => drizzleFor(owner).transaction(fn);

async function workspaceOf(trainer: SignedIn): Promise<string> {
  return (await trainer.http.get("/v1/auth/me")).body.workspace.id;
}

async function onboard(trainer: SignedIn, fullName: string): Promise<string> {
  const response = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName,
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

const count = async (query: string, params: unknown[]) =>
  Number((await owner.query<{ n: string }>(query, params)).rows[0]?.n ?? 0);

describe("data deletion (PROMPT §12.4)", () => {
  it("removes one client's data, login and notifications, leaves the rest, and audits it", async () => {
    const trainer = await signedInTrainer();
    const workspaceId = await workspaceOf(trainer);
    const asha = await onboard(trainer, "Asha Rao");
    const ravi = await onboard(trainer, "Ravi Kumar");
    const invite = (
      await trainer.http.post(`/v1/clients/${asha}/portal/invite`, { channel: "whatsapp" })
    ).body as CreateInviteResponse;
    const portal = client();
    await portal.post("/v1/client-auth/invite/accept", {
      token: invite.link.split("/invite/")[1],
      acceptTerms: true,
    });
    await portal.put("/v1/client/check-in", {
      feeling: "good",
      energy: 7,
      sleep: 6,
      soreness: "mild",
    });
    const { rows } = await owner.query<{ user_id: string }>(
      "select user_id from clients where id = $1",
      [asha],
    );
    const ashaUser = rows[0]?.user_id ?? "";
    expect(ashaUser).not.toBe("");
    expect(
      await count(
        "select count(*) as n from notifications where workspace_id = $1 and title like '%Asha Rao%'",
        [workspaceId],
      ),
    ).toBeGreaterThan(0);

    const report = await asOwner((tx) =>
      deleteClientData(tx, { workspaceId, clientId: asha, reason: "Email 2026-10-28", operator }),
    );
    expect(report).toMatchObject({ kind: "client", loginDeleted: true });
    expect(report.counts).toMatchObject({ check_ins: 1 });

    expect(await count("select count(*) as n from clients where id = $1", [asha])).toBe(0);
    expect(await count("select count(*) as n from check_ins where client_id = $1", [asha])).toBe(0);
    expect(await count("select count(*) as n from measurements where client_id = $1", [asha])).toBe(
      0,
    );
    expect(await count("select count(*) as n from users where id = $1", [ashaUser])).toBe(0);
    expect(
      await count(
        "select count(*) as n from notifications where workspace_id = $1 and title like '%Asha Rao%'",
        [workspaceId],
      ),
    ).toBe(0);
    // The other client is untouched.
    expect(await count("select count(*) as n from clients where id = $1", [ravi])).toBe(1);
    expect(
      await count("select count(*) as n from client_consents where client_id = $1", [ravi]),
    ).toBeGreaterThan(0);
    // The client's session is gone with the login.
    expect((await portal.get("/v1/client/home")).status).toBe(401);
    // Audited, ids only.
    const audit = await owner.query<{ reason: string; after: unknown }>(
      "select reason, after from audit_logs where action = 'client.data_deleted' and target_id = $1",
      [asha],
    );
    expect(audit.rows[0]?.reason).toBe("Email 2026-10-28");
    expect(JSON.stringify(audit.rows[0]?.after)).not.toContain("Asha");
  });

  it("takes a converted lead with its client, and deletes unconverted leads on their own", async () => {
    const trainer = await signedInTrainer();
    const workspaceId = await workspaceOf(trainer);
    const lead = (
      await trainer.http.post("/v1/leads", {
        fullName: "Meena Singh",
        phone: phone(),
        goal: "lose_weight",
        source: "instagram",
      })
    ).body as { id: string };
    const converted = await trainer.http
      .post(`/v1/leads/${lead.id}/convert`, {})
      .set("Idempotency-Key", randomUUID());
    const clientId = converted.body.clientId as string;

    await expect(
      asOwner((tx) =>
        deleteLeadData(tx, { workspaceId, leadId: lead.id, reason: "Request", operator }),
      ),
    ).rejects.toThrow(/Delete the client instead/);

    const report = await asOwner((tx) =>
      deleteClientData(tx, { workspaceId, clientId, reason: "Request", operator }),
    );
    expect(report.counts.leads).toBe(1);
    expect(await count("select count(*) as n from leads where id = $1", [lead.id])).toBe(0);

    const other = (
      await trainer.http.post("/v1/leads", {
        fullName: "Kiran Das",
        phone: phone(),
        goal: "build_muscle",
        source: "referral",
      })
    ).body as { id: string };
    await asOwner((tx) =>
      deleteLeadData(tx, { workspaceId, leadId: other.id, reason: "Request", operator }),
    );
    expect(await count("select count(*) as n from leads where id = $1", [other.id])).toBe(0);
  });

  it("refuses ids from another workspace", async () => {
    const a = await signedInTrainer();
    const b = await signedInTrainer();
    const clientOfA = await onboard(a, "Asha Rao");
    const workspaceOfB = await workspaceOf(b);
    await expect(
      asOwner((tx) =>
        deleteClientData(tx, {
          workspaceId: workspaceOfB,
          clientId: clientOfA,
          reason: "Request",
          operator,
        }),
      ),
    ).rejects.toThrow(/No client with that id in that workspace/);
    expect(await count("select count(*) as n from clients where id = $1", [clientOfA])).toBe(1);
  });
});
