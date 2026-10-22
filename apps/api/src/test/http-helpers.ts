import type { INestApplication } from "@nestjs/common";
import type { Pool } from "pg";
import request from "supertest";
import { expect } from "vitest";
import { createBetaInvite } from "../modules/platform/beta-invites";
import { WEB_HEADERS } from "./create-test-app";
import { asSystem, drizzleFor, signupInput, TEST_SESSION_SECRET } from "./fixtures";

/**
 * HTTP helpers shared by API integration tests. Pass getters because the app and pool are created
 * in `beforeAll`.
 */
export function createHttpHelpers(getApp: () => INestApplication, getSystem: () => Pool) {
  /**
   * A cookie-keeping client with its own client IP (X-Forwarded-For from the trusted loopback hop),
   * so rate limits don't leak between tests or test files sharing the database.
   */
  function client(ip = `10.${randomOctet()}.${randomOctet()}.${randomOctet()}`) {
    const agent = request.agent(getApp().getHttpServer());
    const withHeaders = <T extends request.Test>(test: T): T =>
      test.set(WEB_HEADERS).set("x-forwarded-for", ip) as T;
    return {
      agent,
      ip,
      post: (path: string, body?: object) => withHeaders(agent.post(path)).send(body ?? {}),
      put: (path: string, body?: object) => withHeaders(agent.put(path)).send(body ?? {}),
      patch: (path: string, body?: object) => withHeaders(agent.patch(path)).send(body ?? {}),
      get: (path: string) => agent.get(path).set("x-forwarded-for", ip),
      delete: (path: string) => withHeaders(agent.delete(path)),
      /** Multipart upload of one file field, like the browser's FormData. */
      upload: (path: string, file: Buffer, filename = "photo.jpg", field = "file") =>
        withHeaders(agent.post(path)).attach(field, file, filename),
    };
  }

  async function newInviteCode(maxUses = 1): Promise<string> {
    const invite = await asSystem(drizzleFor(getSystem()), (tx) =>
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
      const { rows } = await getSystem().query<{ subject: string; text_body: string }>(
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
    const token = tokenFrom(verification?.text_body ?? "", "/verify-email");
    expect((await http.post("/v1/auth/verify-email", { token })).status).toBe(200);
    return { email: input.account.email, password: input.account.password, input };
  }

  /** A verified trainer with a signed-in client. */
  async function signedInTrainer() {
    const trainer = await verifiedTrainer();
    const http = client();
    expect(
      (await http.post("/v1/auth/login", { email: trainer.email, password: trainer.password }))
        .status,
    ).toBe(200);
    return { ...trainer, http };
  }

  return { client, newInviteCode, emailsTo, tokenFrom, verifiedTrainer, signedInTrainer };
}

function randomOctet(): number {
  return Math.floor(Math.random() * 250) + 1;
}
