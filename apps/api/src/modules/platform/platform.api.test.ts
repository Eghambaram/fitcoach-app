import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type {
  CreateBetaInviteResponse,
  CreateInviteResponse,
  PlatformAuditListResponse,
  PlatformFeedbackListResponse,
  PlatformHealth,
  PlatformMfaSetupResponse,
  PlatformOverview,
  PlatformTrainerDetail,
  PlatformTrainerListResponse,
} from "@fitcoach/shared";
import { generate } from "otplib";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { asSystem, drizzleFor } from "../../test/fixtures";
import { createHttpHelpers } from "../../test/http-helpers";
import { grantPlatformOwner } from "./platform-roles";

let app: INestApplication;
let system: Pool;
let owner: Pool;
const { client, emailsTo, signedInTrainer, verifiedTrainer } = createHttpHelpers(
  () => app,
  () => system,
);
type Http = ReturnType<typeof client>;

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
  owner = createPool(inject("db").ownerUrl);
});

afterAll(async () => {
  await app.close();
  await Promise.all([system.end(), owner.end()]);
});

/** The code for the period `offset` steps from now (an authenticator a little ahead or behind). */
const codeFor = (secret: string, offset = 0) =>
  generate({ secret, epoch: Math.floor(Date.now() / 1000) + offset * 30 });

async function newOwner() {
  const account = await verifiedTrainer();
  await asSystem(drizzleFor(system), (tx) => grantPlatformOwner(tx, account.email, "test"));
  return account;
}

/** A platform owner signed in with MFA set up (AAL2). */
async function signedInOwner(): Promise<{
  http: Http;
  email: string;
  password: string;
  secret: string;
  recoveryCodes: string[];
}> {
  const account = await newOwner();
  const http = client();
  const login = await http.post("/v1/platform/auth/login", {
    email: account.email,
    password: account.password,
  });
  expect(login.body).toEqual({ next: "mfa_setup" });
  const setup = (await http.get("/v1/platform/auth/mfa/setup")).body as PlatformMfaSetupResponse;
  const enabled = await http.post("/v1/platform/auth/mfa/enable", {
    code: await codeFor(setup.secret),
  });
  expect(enabled.status, JSON.stringify(enabled.body)).toBe(200);
  return { http, ...account, secret: setup.secret, recoveryCodes: enabled.body.recoveryCodes };
}

async function workspaceOf(email: string): Promise<string> {
  const { rows } = await system.query<{ id: string }>(
    "select w.id from workspaces w join users u on u.id = w.owner_user_id where u.email = $1",
    [email],
  );
  return rows[0]?.id ?? "";
}

describe("platform login and MFA", () => {
  it("enrols an authenticator on first sign-in and needs it before anything else", async () => {
    const account = await newOwner();
    const http = client();
    const login = await http.post("/v1/platform/auth/login", {
      email: account.email,
      password: account.password,
    });
    expect(login.status).toBe(200);
    expect(login.body).toEqual({ next: "mfa_setup" });
    // AAL1: only me, logout and the MFA steps.
    expect((await http.get("/v1/auth/me")).body.actor).toBe("platform_owner");
    const blocked = await http.get("/v1/platform/overview");
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("MFA_REQUIRED");
    expect((await http.get("/v1/platform/access")).body.code).toBe("MFA_REQUIRED");
    expect((await http.get("/v1/platform/auth/status")).body).toEqual({
      aal: 1,
      mfaEnabled: false,
    });

    const setup = (await http.get("/v1/platform/auth/mfa/setup")).body as PlatformMfaSetupResponse;
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\/FitCoach%20Platform:/);
    expect(setup.qrSvg).toContain("<svg");
    const { rows } = await system.query<{ secret_ciphertext: string }>(
      "select secret_ciphertext from platform_mfa pm join users u on u.id = pm.user_id where u.email = $1",
      [account.email],
    );
    // Stored encrypted, never as the base32 secret.
    expect(rows[0]?.secret_ciphertext).not.toContain(setup.secret);

    const wrong = await http.post("/v1/platform/auth/mfa/enable", { code: "000000" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.fieldErrors.code).toBeDefined();
    const enabled = await http.post("/v1/platform/auth/mfa/enable", {
      code: await codeFor(setup.secret),
    });
    expect(enabled.status).toBe(200);
    expect(enabled.body.recoveryCodes).toHaveLength(10);
    expect((await http.get("/v1/platform/access")).status).toBe(200);
    expect((await http.get("/v1/platform/auth/status")).body).toEqual({ aal: 2, mfaEnabled: true });
    // Once enabled, a new secret can't be swapped in.
    expect((await http.get("/v1/platform/auth/mfa/setup")).status).toBe(409);
  });

  it("asks for a fresh code on the next sign-in; a replayed code or used recovery code fails", async () => {
    const ownerAccount = await signedInOwner();
    const http = client();
    const login = await http.post("/v1/platform/auth/login", {
      email: ownerAccount.email,
      password: ownerAccount.password,
    });
    expect(login.body).toEqual({ next: "mfa_verify" });
    // The code used to enable MFA is from this period: replaying it is refused.
    const replay = await http.post("/v1/platform/auth/mfa/verify", {
      code: await codeFor(ownerAccount.secret),
    });
    expect(replay.status).toBe(400);
    // The next period's code is accepted (clock tolerance), and only once.
    const next = await codeFor(ownerAccount.secret, 1);
    expect((await http.post("/v1/platform/auth/mfa/verify", { code: next })).status).toBe(200);
    expect((await http.get("/v1/platform/overview")).status).toBe(200);

    const other = client();
    await other.post("/v1/platform/auth/login", {
      email: ownerAccount.email,
      password: ownerAccount.password,
    });
    expect((await other.post("/v1/platform/auth/mfa/verify", { code: next })).status).toBe(400);
    const recovery = ownerAccount.recoveryCodes[0] ?? "";
    expect(
      (await other.post("/v1/platform/auth/mfa/verify", { recoveryCode: recovery.toLowerCase() }))
        .status,
    ).toBe(200);
    const third = client();
    await third.post("/v1/platform/auth/login", {
      email: ownerAccount.email,
      password: ownerAccount.password,
    });
    expect(
      (await third.post("/v1/platform/auth/mfa/verify", { recoveryCode: recovery })).status,
    ).toBe(400);
  });

  it("refuses trainers at the platform login and everywhere under /platform", async () => {
    const trainer = await signedInTrainer();
    const login = await client().post("/v1/platform/auth/login", {
      email: trainer.email,
      password: trainer.password,
    });
    expect(login.status).toBe(401);
    expect(login.body.code).toBe("INVALID_CREDENTIALS");
    for (const path of ["/v1/platform/overview", "/v1/platform/trainers", "/v1/platform/health"]) {
      expect((await trainer.http.get(path)).status).toBe(403);
      expect((await client().get(path)).status).toBe(401);
    }
    expect((await trainer.http.get("/v1/platform/auth/mfa/setup")).status).toBe(403);
    const workspaceId = await workspaceOf(trainer.email);
    expect(
      (
        await trainer.http.post(`/v1/platform/trainers/${workspaceId}/suspend`, {
          reason: "x" + "yz",
        })
      ).status,
    ).toBe(403);
    // A trainer session was never platform-elevated, whatever the URL says.
    expect(
      (await trainer.http.post("/v1/platform/auth/mfa/verify", { code: "123456" })).status,
    ).toBe(403);
  });

  it("ends platform sessions when the role is revoked", async () => {
    const ownerAccount = await signedInOwner();
    expect((await ownerAccount.http.get("/v1/platform/access")).status).toBe(200);
    await owner.query(
      "update platform_roles set revoked_at = now() where user_id = (select id from users where email = $1)",
      [ownerAccount.email],
    );
    expect((await ownerAccount.http.get("/v1/platform/access")).status).toBe(401);
  });
});

describe("platform admin", () => {
  it("shows real counts and trainer details without client data", async () => {
    const { http } = await signedInOwner();
    const trainer = await signedInTrainer();
    const onboarded = await trainer.http
      .post("/v1/onboarding/finalize", {
        fullName: "Asha Rao",
        phone: `96${String(Date.now()).slice(-8)}`,
        primaryGoal: "lose_weight",
        trainingMode: "in_person",
        consentDataProcessing: true,
        units: { weightUnit: "kg", lengthUnit: "cm" },
      })
      .set("Idempotency-Key", randomUUID());
    expect(onboarded.status).toBe(201);
    const workspaceId = await workspaceOf(trainer.email);

    const overview = (await http.get("/v1/platform/overview")).body as PlatformOverview;
    expect(overview.trainers.total).toBeGreaterThanOrEqual(1);
    expect(overview.trainers.activeThisWeek).toBeGreaterThanOrEqual(1);
    expect(overview.activeClients).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(overview)).not.toMatch(/revenue|mrr/i);

    const list = (await http.get(`/v1/platform/trainers?q=${encodeURIComponent(trainer.email)}`))
      .body as PlatformTrainerListResponse;
    expect(list.items.map((item) => item.workspaceId)).toEqual([workspaceId]);
    expect(list.items[0]?.activeClients).toBe(1);

    const detail = (await http.get(`/v1/platform/trainers/${workspaceId}`))
      .body as PlatformTrainerDetail;
    expect(detail.usage).toMatchObject({ clients: 1, leads: 0 });
    expect(detail.checklist.hasLeadOrClient).toBe(true);
    expect(detail.plan?.planId).toBe("beta");
    // Counts only: the client's name never leaves the workspace.
    expect(JSON.stringify(detail)).not.toContain("Asha Rao");
    expect((await http.get(`/v1/platform/trainers/${randomUUID()}`)).status).toBe(404);
  });

  it("changes the plan, suspends and reactivates with a reason, all audited", async () => {
    const { http } = await signedInOwner();
    const trainer = await signedInTrainer();
    const workspaceId = await workspaceOf(trainer.email);

    const plan = await http.patch(`/v1/platform/trainers/${workspaceId}/plan`, {
      planId: "beta",
      maxActiveClients: 5,
      trialEndsOn: "2030-01-31",
    });
    expect(plan.status, JSON.stringify(plan.body)).toBe(200);
    expect(plan.body.plan).toMatchObject({ maxActiveClients: 5 });
    expect(plan.body.plan.trialEndsAt).toMatch(/^2030-01-31T18:30:00/);
    expect(
      (
        await http.patch(`/v1/platform/trainers/${workspaceId}/plan`, {
          planId: "gold",
          maxActiveClients: 5,
          trialEndsOn: null,
        })
      ).status,
    ).toBe(400);

    expect((await http.post(`/v1/platform/trainers/${workspaceId}/suspend`, {})).status).toBe(400);
    const suspended = await http.post(`/v1/platform/trainers/${workspaceId}/suspend`, {
      reason: "Unpaid test account",
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body.status).toBe("suspended");
    // Signed out; signing in again gives a read-only workspace with the reason in the bell.
    expect((await trainer.http.get("/v1/auth/me")).status).toBe(401);
    const again = client();
    await again.post("/v1/auth/login", { email: trainer.email, password: trainer.password });
    expect((await again.get("/v1/leads")).status).toBe(200);
    expect(
      (
        await again.post("/v1/leads", {
          fullName: "New Lead",
          phone: "9811111111",
          goal: "lose_weight",
          source: "instagram",
        })
      ).body.code,
    ).toBe("WORKSPACE_READ_ONLY");
    const notices = await again.get("/v1/notifications");
    expect(notices.body.items[0]).toMatchObject({ type: "workspace_suspended" });
    expect(notices.body.items[0].body).toContain("Unpaid test account");

    const reactivated = await http.post(`/v1/platform/trainers/${workspaceId}/reactivate`, {
      reason: "Sorted out",
    });
    expect(reactivated.body.status).toBe("active");

    const audit = (
      await http.get(`/v1/platform/audit-logs?workspaceId=${workspaceId}&actorKind=platform_owner`)
    ).body as PlatformAuditListResponse;
    expect(audit.items.map((item) => item.action)).toEqual([
      "workspace.reactivated",
      "workspace.suspended",
      "workspace.plan_changed",
    ]);
    expect(audit.items[1]?.reason).toBe("Unpaid test account");
    const actions = (await http.get("/v1/platform/audit-logs?action=workspace.suspended"))
      .body as PlatformAuditListResponse;
    expect(actions.items.every((item) => item.action === "workspace.suspended")).toBe(true);
  });

  it("approves a pending signup, sends a reset email and revokes sessions", async () => {
    const { http } = await signedInOwner();
    const trainer = await signedInTrainer();
    const workspaceId = await workspaceOf(trainer.email);
    await owner.query("update workspaces set status = 'pending_approval' where id = $1", [
      workspaceId,
    ]);
    const approved = await http.post(`/v1/platform/trainers/${workspaceId}/approve`);
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("active");
    expect((await http.post(`/v1/platform/trainers/${workspaceId}/approve`)).status).toBe(409);
    const ready = await emailsTo(trainer.email, 2);
    expect(ready.map((mail) => mail.subject)).toContain("Your FitCoach account is ready");

    expect((await http.post(`/v1/platform/trainers/${workspaceId}/password-reset`)).status).toBe(
      200,
    );
    const mails = await emailsTo(trainer.email, 3);
    expect(mails.map((mail) => mail.subject)).toContain("Reset your FitCoach password");

    expect((await trainer.http.get("/v1/auth/me")).status).toBe(200);
    const revoked = await http.post(`/v1/platform/trainers/${workspaceId}/revoke-sessions`);
    expect(revoked.body.activeSessions).toBe(0);
    expect((await trainer.http.get("/v1/auth/me")).status).toBe(401);
  });

  it("creates and revokes beta invite codes that work at signup", async () => {
    const { http } = await signedInOwner();
    const created = (
      await http.post("/v1/platform/beta-invites", { label: "Pune", maxUses: 2, expiresInDays: 7 })
    ).body as CreateBetaInviteResponse;
    expect(created.code).toMatch(/^FIT-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(created.invite).toMatchObject({ label: "Pune", maxUses: 2, uses: 0, status: "active" });
    const listed = await http.get("/v1/platform/beta-invites");
    expect(listed.body.items.some((item: { id: string }) => item.id === created.invite.id)).toBe(
      true,
    );
    // The code is never listed again.
    expect(JSON.stringify(listed.body)).not.toContain(created.code);
    const revoked = await http.delete(`/v1/platform/beta-invites/${created.invite.id}`);
    expect(
      revoked.body.items.find((item: { id: string }) => item.id === created.invite.id).status,
    ).toBe("revoked");
    expect((await http.delete(`/v1/platform/beta-invites/${created.invite.id}`)).status).toBe(404);
  });

  it("lists feedback and triages it", async () => {
    const { http } = await signedInOwner();
    const trainer = await signedInTrainer();
    const sent = await trainer.http.post("/v1/feedback", {
      message: "Calendar should start on Monday",
      page: "/app/calendar",
    });
    const open = (await http.get("/v1/platform/feedback?status=open"))
      .body as PlatformFeedbackListResponse;
    const item = open.items.find((entry) => entry.id === sent.body.id);
    expect(item).toMatchObject({ page: "/app/calendar", status: "open" });
    expect(
      (await http.patch(`/v1/platform/feedback/${sent.body.id}`, { status: "triaged" })).status,
    ).toBe(200);
    const triaged = (await http.get("/v1/platform/feedback?status=triaged"))
      .body as PlatformFeedbackListResponse;
    expect(triaged.items.some((entry) => entry.id === sent.body.id)).toBe(true);
    expect(
      (await http.patch(`/v1/platform/feedback/${randomUUID()}`, { status: "closed" })).status,
    ).toBe(404);
  });

  it("reports health honestly", async () => {
    const { http } = await signedInOwner();
    const health = (await http.get("/v1/platform/health")).body as PlatformHealth;
    expect(health.database.status).toBe("ok");
    expect(health.storage.status).toBe("ok");
    // Tests use the console email provider; backups arrive in step 6.2.
    expect(health.email.status).toBe("not_configured");
    expect(health.backups.status).toBe("unknown");
    expect(health.storageBudget.budgetBytes).toBeGreaterThan(0);
  });

  it("keeps a trainer's client app out of the platform", async () => {
    const trainer = await signedInTrainer();
    const onboarded = await trainer.http
      .post("/v1/onboarding/finalize", {
        fullName: "Ravi Kumar",
        phone: `97${String(Date.now()).slice(-8)}`,
        primaryGoal: "build_muscle",
        trainingMode: "in_person",
        consentDataProcessing: true,
        units: { weightUnit: "kg", lengthUnit: "cm" },
      })
      .set("Idempotency-Key", randomUUID());
    const invite = (
      await trainer.http.post(`/v1/clients/${onboarded.body.clientId}/portal/invite`, {
        channel: "whatsapp",
      })
    ).body as CreateInviteResponse;
    const phone = client();
    await phone.post("/v1/client-auth/invite/accept", {
      token: invite.link.split("/invite/")[1],
      acceptTerms: true,
    });
    expect((await phone.get("/v1/platform/access")).status).toBe(403);
    expect((await phone.get("/v1/platform/trainers")).status).toBe(403);
  });
});
