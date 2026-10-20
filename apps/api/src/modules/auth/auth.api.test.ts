import type { INestApplication } from "@nestjs/common";
import { meResponseSchema, sessionsResponseSchema } from "@fitcoach/shared";
import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createTestApp, WEB_HEADERS } from "../../test/create-test-app";
import { createPool } from "../../test/db";
import { asSystem, drizzleFor, signupInput, TEST_SESSION_SECRET } from "../../test/fixtures";
import { createBetaInvite } from "../platform/beta-invites";

let app: INestApplication;
let system: Pool;
let ipCounter = 10;

/** Every scenario gets its own client IP (X-Forwarded-For from the loopback proxy hop) so rate limits don't leak between tests. */
function client(ip = `198.51.100.${ipCounter++}`) {
  const agent = request.agent(app.getHttpServer());
  const withHeaders = <T extends request.Test>(test: T): T =>
    test.set(WEB_HEADERS).set("x-forwarded-for", ip) as T;
  return {
    post: (path: string, body?: object) => withHeaders(agent.post(path)).send(body ?? {}),
    get: (path: string) => agent.get(path).set("x-forwarded-for", ip),
    delete: (path: string) => withHeaders(agent.delete(path)),
  };
}

async function newInviteCode(maxUses = 1): Promise<string> {
  const invite = await asSystem(drizzleFor(system), (tx) =>
    createBetaInvite(tx, TEST_SESSION_SECRET, {
      maxUses,
      expiresAt: new Date(Date.now() + 3_600_000),
      createdBy: "cli",
    }),
  );
  return invite.code;
}

/** The console email provider writes to email_outbox; emails are sent in the background, so poll briefly. */
async function emailsTo(
  address: string,
  expected = 1,
): Promise<{ subject: string; text_body: string }[]> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const { rows } = await system.query<{ subject: string; text_body: string }>(
      "select subject, text_body from email_outbox where to_address = $1 order by created_at",
      [address],
    );
    if (rows.length >= expected) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return [];
}

function tokenFrom(text: string, path: string): string {
  const match = text.match(new RegExp(`${path}\\?token=([A-Za-z0-9_%-]+)`));
  if (!match?.[1]) throw new Error(`no ${path} link in email`);
  return decodeURIComponent(match[1]);
}

/** Signs up with a fresh code and verifies the email. Returns the credentials. */
async function verifiedTrainer() {
  const input = { ...signupInput(), inviteCode: await newInviteCode() };
  const http = client();
  expect((await http.post("/v1/auth/signup", input)).status).toBe(202);
  const [verification] = await emailsTo(input.account.email);
  expect(
    (
      await http.post("/v1/auth/verify-email", {
        token: tokenFrom(verification?.text_body ?? "", "/verify-email"),
      })
    ).status,
  ).toBe(200);
  return { email: input.account.email, password: input.account.password, input };
}

beforeAll(async () => {
  app = await createTestApp();
  system = createPool(inject("db").systemUrl);
});

afterAll(async () => {
  await app.close();
  await system.end();
});

describe("trainer signup → verify → login → sessions → logout (step 1.3 Done when)", () => {
  it("runs the whole journey", async () => {
    const input = { ...signupInput(), inviteCode: await newInviteCode() };
    const http = client();

    const signup = await http.post("/v1/auth/signup", input);
    expect(signup.status).toBe(202);
    expect(signup.body).toEqual({ status: "accepted" });

    // Unverified accounts can't sign in yet.
    const early = await http.post("/v1/auth/login", {
      email: input.account.email,
      password: input.account.password,
    });
    expect(early.status).toBe(403);
    expect(early.body.code).toBe("EMAIL_NOT_VERIFIED");

    const emails = await emailsTo(input.account.email, 2);
    expect(emails[0]?.subject).toBe("Confirm your email for FitCoach");
    const token = tokenFrom(emails.at(-1)?.text_body ?? "", "/verify-email");
    expect((await http.post("/v1/auth/verify-email", { token })).status).toBe(200);

    const login = await http.post("/v1/auth/login", {
      email: input.account.email.toUpperCase(),
      password: input.account.password,
    });
    expect(login.status).toBe(200);
    const cookie = String(login.headers["set-cookie"]);
    expect(cookie).toMatch(/^fc_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure"); // local/test only; staging and production set Secure

    const me = meResponseSchema.parse((await http.get("/v1/auth/me")).body);
    expect(me).toMatchObject({
      actor: "trainer",
      user: { email: input.account.email, emailVerified: true },
      profile: { displayName: input.profile.displayName },
      workspace: {
        slug: input.business.slug,
        name: input.business.businessName,
        status: "active",
        timezone: "Asia/Kolkata",
      },
    });

    const sessions = sessionsResponseSchema.parse(
      (await http.get("/v1/auth/sessions")).body,
    ).sessions;
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.current).toBe(true);

    const logout = await http.post("/v1/auth/logout");
    expect(logout.status).toBe(200);
    expect(String(logout.headers["set-cookie"])).toMatch(/fc_session=;/);
    expect((await http.get("/v1/auth/me")).status).toBe(401);
  });
});

describe("signup", () => {
  it("requires a beta invite code in invite_code mode", async () => {
    const response = await client().post("/v1/auth/signup", signupInput());

    expect(response.status).toBe(400);
    expect(response.body.fieldErrors).toHaveProperty("inviteCode");
  });

  it("rejects an unknown code and a used-up code", async () => {
    const code = await newInviteCode(1);
    const http = client();
    expect(
      (await http.post("/v1/auth/signup", { ...signupInput(), inviteCode: code })).status,
    ).toBe(202);

    for (const inviteCode of [code, "FIT-ZZZZ-ZZZZ"]) {
      const response = await http.post("/v1/auth/signup", { ...signupInput(), inviteCode });
      expect(response.status).toBe(400);
      expect(response.body.fieldErrors).toHaveProperty("inviteCode");
    }
  });

  it("returns field errors from the shared schema", async () => {
    const input = signupInput();
    const response = await client().post("/v1/auth/signup", {
      ...input,
      account: { email: "not-an-email", password: "password123" },
      business: { ...input.business, slug: "admin" },
    });

    expect(response.status).toBe(400);
    expect(Object.keys(response.body.fieldErrors)).toEqual(
      expect.arrayContaining(["account.email", "account.password", "business.slug"]),
    );
  });

  it("refuses a taken page address", async () => {
    const first = await verifiedTrainer();
    const response = await client().post("/v1/auth/signup", {
      ...signupInput({ slug: first.input.business.slug }),
      inviteCode: await newInviteCode(),
    });

    expect(response.status).toBe(409);
    expect(response.body.fieldErrors).toHaveProperty(["business.slug"]);
  });

  it("answers an existing email exactly like a new one, without using the code (non-enumerating)", async () => {
    const existing = await verifiedTrainer();
    const code = await newInviteCode(1);

    const response = await client().post("/v1/auth/signup", {
      ...signupInput(),
      account: { email: existing.email, password: "another-long-passphrase" },
      inviteCode: code,
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: "accepted" });
    const emails = await emailsTo(existing.email, 2);
    expect(emails.at(-1)?.subject).toBe("You already have a FitCoach account");
    // The code wasn't spent on the duplicate attempt.
    expect(
      (await client().post("/v1/auth/signup", { ...signupInput(), inviteCode: code })).status,
    ).toBe(202);
  });

  it("records the signup in the audit log and product events", async () => {
    const trainer = await verifiedTrainer();
    const { rows } = await system.query<{ events: string[]; audited: number }>(
      `select array(select event from product_events pe join users u on u.id = pe.user_id where u.email = $1 order by occurred_at) as events,
              (select count(*)::int from audit_logs a join users u on u.id = a.actor_user_id where u.email = $1 and a.action = 'trainer.signed_up') as audited`,
      [trainer.email],
    );

    expect(rows[0]).toEqual({ events: ["trainer_signed_up", "email_verified"], audited: 1 });
  });
});

describe("login", () => {
  it("gives the same answer for a wrong password and an unknown email", async () => {
    const trainer = await verifiedTrainer();
    const http = client();

    const wrongPassword = await http.post("/v1/auth/login", {
      email: trainer.email,
      password: "wrong-password-here",
    });
    const unknownEmail = await http.post("/v1/auth/login", {
      email: "nobody@example.test",
      password: "wrong-password-here",
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect({ ...wrongPassword.body, requestId: "" }).toEqual({
      ...unknownEmail.body,
      requestId: "",
    });
  });

  it("rate-limits repeated attempts for one email", async () => {
    const trainer = await verifiedTrainer();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt++) {
      // Different IPs: the per-email limit (10 / 15 min) must still apply.
      statuses.push(
        (
          await client().post("/v1/auth/login", {
            email: trainer.email,
            password: "wrong-password-here",
          })
        ).status,
      );
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
  });

  it("requires the CSRF header like every other state-changing request", async () => {
    const response = await request(app.getHttpServer())
      .post("/v1/auth/login")
      .set("origin", WEB_HEADERS.origin)
      .send({ email: "a@b.co", password: "x" });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("CSRF_REJECTED");
  });

  it("rotates: every login creates a new session", async () => {
    const trainer = await verifiedTrainer();
    const laptop = client();
    const phone = client();
    await laptop.post("/v1/auth/login", trainer);
    await phone.post("/v1/auth/login", trainer);

    const sessions = sessionsResponseSchema.parse(
      (await laptop.get("/v1/auth/sessions")).body,
    ).sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
  });
});

describe("sessions", () => {
  it("revokes another of my sessions, which then stops working", async () => {
    const trainer = await verifiedTrainer();
    const laptop = client();
    const phone = client();
    await laptop.post("/v1/auth/login", trainer);
    await phone.post("/v1/auth/login", trainer);
    const phoneSession = sessionsResponseSchema
      .parse((await phone.get("/v1/auth/sessions")).body)
      .sessions.find((s) => s.current);

    expect((await laptop.delete(`/v1/auth/sessions/${phoneSession?.id}`)).status).toBe(200);
    expect((await phone.get("/v1/auth/me")).status).toBe(401);
    expect((await laptop.get("/v1/auth/me")).status).toBe(200);
  });

  it("can't see or revoke another trainer's sessions (tampering)", async () => {
    const a = await verifiedTrainer();
    const b = await verifiedTrainer();
    const aHttp = client();
    const bHttp = client();
    await aHttp.post("/v1/auth/login", a);
    await bHttp.post("/v1/auth/login", b);
    const aSession = sessionsResponseSchema.parse((await aHttp.get("/v1/auth/sessions")).body)
      .sessions[0];

    const bSessions = sessionsResponseSchema.parse(
      (await bHttp.get("/v1/auth/sessions")).body,
    ).sessions;
    expect(bSessions.map((s) => s.id)).not.toContain(aSession?.id);
    const attack = await bHttp.delete(`/v1/auth/sessions/${aSession?.id}`);
    expect(attack.status).toBe(404);
    expect((await aHttp.get("/v1/auth/me")).status).toBe(200);
  });

  it("rejects a forged or malformed session cookie", async () => {
    for (const cookie of [
      "fc_session=forged-token-value-that-is-long-enough-1234567",
      "fc_session=",
    ]) {
      const response = await request(app.getHttpServer()).get("/v1/auth/me").set("cookie", cookie);
      expect(response.status).toBe(401);
      expect(response.body.code).toBe("UNAUTHENTICATED");
    }
  });

  it("refuses protected routes without a session", async () => {
    expect((await request(app.getHttpServer()).get("/v1/auth/sessions")).status).toBe(401);
  });
});

describe("password reset", () => {
  it("resets the password once, signs out every device, and lets the new password in", async () => {
    const trainer = await verifiedTrainer();
    const device = client();
    await device.post("/v1/auth/login", trainer);

    const http = client();
    expect((await http.post("/v1/auth/password/forgot", { email: trainer.email })).status).toBe(
      202,
    );
    const emails = await emailsTo(trainer.email, 2);
    const token = tokenFrom(emails.at(-1)?.text_body ?? "", "/reset-password");

    expect(
      (await http.post("/v1/auth/password/reset", { token, password: "a-brand-new-passphrase" }))
        .status,
    ).toBe(200);
    expect((await device.get("/v1/auth/me")).status).toBe(401);
    expect(
      (await http.post("/v1/auth/login", { email: trainer.email, password: trainer.password }))
        .status,
    ).toBe(401);
    expect(
      (
        await http.post("/v1/auth/login", {
          email: trainer.email,
          password: "a-brand-new-passphrase",
        })
      ).status,
    ).toBe(200);

    const reuse = await http.post("/v1/auth/password/reset", {
      token,
      password: "yet-another-passphrase",
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.code).toBe("TOKEN_INVALID");
  });

  it("answers unknown emails the same way and sends nothing", async () => {
    const response = await client().post("/v1/auth/password/forgot", {
      email: "nobody-here@example.test",
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ status: "accepted" });
    expect(await emailsTo("nobody-here@example.test")).toEqual([]);
  });

  it("rejects a verification link that was already used", async () => {
    const input = { ...signupInput(), inviteCode: await newInviteCode() };
    const http = client();
    await http.post("/v1/auth/signup", input);
    const [email] = await emailsTo(input.account.email);
    const token = tokenFrom(email?.text_body ?? "", "/verify-email");

    expect((await http.post("/v1/auth/verify-email", { token })).status).toBe(200);
    expect((await http.post("/v1/auth/verify-email", { token })).body.code).toBe("TOKEN_INVALID");
  });
});

describe("workspace status", () => {
  it("keeps a pending workspace signed in but away from workspace routes", async () => {
    const trainer = await verifiedTrainer();
    await system.query(
      "update workspaces set status = 'pending_approval' where id = (select workspace_id from workspace_members m join users u on u.id = m.user_id where u.email = $1)",
      [trainer.email],
    );
    const http = client();
    await http.post("/v1/auth/login", trainer);

    const me = await http.get("/v1/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.workspace.status).toBe("pending_approval");
  });
});
