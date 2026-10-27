import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { CreateInviteResponse } from "@fitcoach/shared";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { createHttpHelpers } from "../../test/http-helpers";

let app: INestApplication;
let system: Pool;
const { client, emailsTo, signedInTrainer } = createHttpHelpers(
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

let counter = 0;
async function newClient(
  trainer: SignedIn,
  email: string | null = `client-${randomUUID()}@example.com`,
) {
  const response = await trainer.http
    .post("/v1/onboarding/finalize", {
      fullName: "Asha Rao",
      phone: `96${String(Date.now()).slice(-6)}${String(counter++ % 100).padStart(2, "0")}`,
      ...(email ? { email } : {}),
      primaryGoal: "build_muscle",
      trainingMode: "in_person",
      consentDataProcessing: true,
      units: { weightUnit: "kg", lengthUnit: "cm" },
    })
    .set("Idempotency-Key", randomUUID());
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return { id: response.body.clientId as string, email };
}

const tokenOf = (link: string) => link.split("/invite/")[1] ?? "";

async function invite(trainer: SignedIn, clientId: string, channel = "whatsapp") {
  const response = await trainer.http.post(`/v1/clients/${clientId}/portal/invite`, { channel });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body as CreateInviteResponse;
}

describe("client invite link", () => {
  it("invites by WhatsApp, accepts once into a 60-day client session, and shows only the client's own data", async () => {
    const trainer = await signedInTrainer();
    const asha = await newClient(trainer);
    expect((await trainer.http.get(`/v1/clients/${asha.id}/portal`)).body).toMatchObject({
      status: "not_invited",
      invite: null,
      canWhatsApp: true,
      canEmail: true,
    });

    const sent = await invite(trainer, asha.id);
    expect(sent.access).toMatchObject({ status: "invited", invite: { channel: "whatsapp" } });
    expect(sent.link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);
    expect(sent.whatsApp?.url).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(sent.whatsApp?.text).toContain(sent.link);
    expect(sent.whatsApp?.text).toContain("Asha");
    const days = (Date.parse(sent.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    // Only the HMAC is stored.
    const stored = await system.query("select 1 from client_invites where token_hash = $1", [
      tokenOf(sent.link),
    ]);
    expect(stored.rowCount).toBe(0);

    // The preview names the trainer only, never the client.
    const phone = client();
    const preview = await phone.post("/v1/client-auth/invite/preview", {
      token: tokenOf(sent.link),
    });
    expect(preview.status).toBe(200);
    expect(Object.keys(preview.body).sort()).toEqual([
      "businessName",
      "trainerAvatarUrl",
      "trainerName",
    ]);
    expect(JSON.stringify(preview.body)).not.toContain("Asha");

    expect(
      (await phone.post("/v1/client-auth/invite/accept", { token: tokenOf(sent.link) })).status,
    ).toBe(400);
    const accepted = await phone.post("/v1/client-auth/invite/accept", {
      token: tokenOf(sent.link),
      acceptTerms: true,
    });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
    const cookie = String(accepted.headers["set-cookie"]);
    expect(cookie).toMatch(/fc_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    const expires = Date.parse(cookie.match(/Expires=([^;]+)/i)?.[1] ?? "");
    expect((expires - Date.now()) / 86_400_000).toBeGreaterThan(59);

    const me = await phone.get("/v1/client/me");
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({
      client: { id: asha.id, firstName: "Asha" },
      workspace: { readOnly: false },
    });
    expect(JSON.stringify(me.body)).not.toMatch(/limitations|phone|email/);
    expect((await phone.get("/v1/auth/me")).body).toMatchObject({ actor: "client" });

    // Used once: the same link never works again.
    const second = client();
    expect(
      (
        await second.post("/v1/client-auth/invite/accept", {
          token: tokenOf(sent.link),
          acceptTerms: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (await second.post("/v1/client-auth/invite/preview", { token: tokenOf(sent.link) })).status,
    ).toBe(400);

    expect((await trainer.http.get(`/v1/clients/${asha.id}/portal`)).body).toMatchObject({
      status: "active",
      invite: null,
    });
  });

  it("keeps clients out of trainer and other clients' data (tampering)", async () => {
    const trainer = await signedInTrainer();
    const asha = await newClient(trainer);
    const ravi = await newClient(trainer);
    const sent = await invite(trainer, asha.id);
    const phone = client();
    await phone.post("/v1/client-auth/invite/accept", {
      token: tokenOf(sent.link),
      acceptTerms: true,
    });

    for (const path of [
      "/v1/clients",
      `/v1/clients/${asha.id}`,
      `/v1/clients/${ravi.id}`,
      `/v1/clients/${asha.id}/packages`,
      `/v1/clients/${asha.id}/portal`,
      "/v1/leads",
      "/v1/appointments/needs-attendance",
      "/v1/programs",
      "/v1/settings",
    ]) {
      expect((await phone.get(path)).status, path).toBe(403);
    }
    expect(
      (await phone.post(`/v1/clients/${ravi.id}/portal/invite`, { channel: "whatsapp" })).status,
    ).toBe(403);
    // A trainer can't use client routes either.
    expect((await trainer.http.get("/v1/client/me")).status).toBe(403);

    // Another trainer can't see or invite this client.
    const other = await signedInTrainer();
    expect((await other.http.get(`/v1/clients/${asha.id}/portal`)).status).toBe(404);
    expect(
      (await other.http.post(`/v1/clients/${asha.id}/portal/invite`, { channel: "whatsapp" }))
        .status,
    ).toBe(404);
    expect((await other.http.post(`/v1/clients/${asha.id}/portal/revoke`)).status).toBe(404);
  });

  it("revokes older links on regenerate, and revoking access signs the client out", async () => {
    const trainer = await signedInTrainer();
    const asha = await newClient(trainer);
    const first = await invite(trainer, asha.id);
    const second = await invite(trainer, asha.id);
    const phone = client();
    expect(
      (
        await phone.post("/v1/client-auth/invite/accept", {
          token: tokenOf(first.link),
          acceptTerms: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await phone.post("/v1/client-auth/invite/accept", {
          token: tokenOf(second.link),
          acceptTerms: true,
        })
      ).status,
    ).toBe(200);
    expect((await phone.get("/v1/client/me")).status).toBe(200);

    const third = await invite(trainer, asha.id);
    const revoked = await trainer.http.post(`/v1/clients/${asha.id}/portal/revoke`);
    expect(revoked.body).toMatchObject({ status: "revoked", invite: null });
    expect((await phone.get("/v1/client/me")).status).toBe(401);
    expect(
      (
        await client().post("/v1/client-auth/invite/accept", {
          token: tokenOf(third.link),
          acceptTerms: true,
        })
      ).status,
    ).toBe(400);

    // A new invite restores access for the same login.
    const again = await invite(trainer, asha.id);
    expect(again.access.status).toBe("active");
    const back = client();
    expect(
      (
        await back.post("/v1/client-auth/invite/accept", {
          token: tokenOf(again.link),
          acceptTerms: true,
        })
      ).status,
    ).toBe(200);
    const users = await system.query("select user_id from clients where id = $1", [asha.id]);
    expect(users.rows).toHaveLength(1);
    expect((await back.get("/v1/client/me")).body.client.id).toBe(asha.id);
  });

  it("refuses expired links and archived clients, and emails the link to clients without a phone choice", async () => {
    const trainer = await signedInTrainer();
    const asha = await newClient(trainer);
    const sent = await invite(trainer, asha.id, "email");
    expect(sent.emailed).toBe(true);
    expect(sent.whatsApp).toBeNull();
    const [mail] = await emailsTo(asha.email ?? "");
    expect(mail?.text_body).toContain(sent.link);

    await system.query(
      "update client_invites set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where client_id = $1",
      [asha.id],
    );
    expect(
      (
        await client().post("/v1/client-auth/invite/accept", {
          token: tokenOf(sent.link),
          acceptTerms: true,
        })
      ).status,
    ).toBe(400);
    expect((await trainer.http.get(`/v1/clients/${asha.id}/portal`)).body.status).toBe("expired");

    const noEmail = await newClient(trainer, null);
    expect(
      (await trainer.http.post(`/v1/clients/${noEmail.id}/portal/invite`, { channel: "email" }))
        .status,
    ).toBe(400);

    const fresh = await invite(trainer, asha.id);
    expect(
      (
        await trainer.http.post(`/v1/clients/${asha.id}/status`, {
          action: "archive",
          reason: "Moved away",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await client().post("/v1/client-auth/invite/accept", {
          token: tokenOf(fresh.link),
          acceptTerms: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (await trainer.http.post(`/v1/clients/${asha.id}/portal/invite`, { channel: "whatsapp" }))
        .status,
    ).toBe(409);
  });
});

describe("client email code", () => {
  async function joined() {
    const trainer = await signedInTrainer();
    const asha = await newClient(trainer);
    const sent = await invite(trainer, asha.id);
    await client().post("/v1/client-auth/invite/accept", {
      token: tokenOf(sent.link),
      acceptTerms: true,
    });
    return { trainer, asha };
  }
  const codeIn = (text: string) => text.match(/\b(\d{6})\b/)?.[1] ?? "";

  it("signs a client back in with a 6-digit code, once", async () => {
    const { asha } = await joined();
    const email = asha.email ?? "";
    const phone = client();
    expect((await phone.post("/v1/client-auth/code", { email })).status).toBe(202);
    const [mail] = await emailsTo(email);
    const code = codeIn(mail?.text_body ?? "");
    expect(code).toMatch(/^\d{6}$/);
    const ok = await phone.post("/v1/client-auth/code/verify", { email, code });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await phone.get("/v1/client/me")).body.client.id).toBe(asha.id);
    expect((await client().post("/v1/client-auth/code/verify", { email, code })).status).toBe(400);
  });

  it("never reveals whether an email has access, and burns a code after 5 wrong tries", async () => {
    const { asha } = await joined();
    const email = asha.email ?? "";
    const stranger = `nobody-${randomUUID()}@example.com`;
    const phone = client();
    const unknown = await phone.post("/v1/client-auth/code", { email: stranger });
    expect(unknown.status).toBe(202);
    expect(await emailsTo(stranger, 1)).toEqual([]);

    await phone.post("/v1/client-auth/code", { email });
    const [mail] = await emailsTo(email);
    const code = codeIn(mail?.text_body ?? "");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await phone.post("/v1/client-auth/code/verify", { email, code: wrong });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("That code is wrong or has expired.");
    }
    expect((await phone.post("/v1/client-auth/code/verify", { email, code })).status).toBe(400);
    const missing = await phone.post("/v1/client-auth/code/verify", { email: stranger, code });
    expect(missing.body.message).toBe("That code is wrong or has expired.");
  });

  it("rate-limits code requests per email", async () => {
    const { asha } = await joined();
    const email = asha.email ?? "";
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      statuses.push((await client().post("/v1/client-auth/code", { email })).status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 202)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
