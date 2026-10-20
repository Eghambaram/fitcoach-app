import { Body, Controller, Get, type INestApplication, Post } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { createZodDto } from "nestjs-zod";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { Public } from "./auth/decorators";
import { DbContext } from "../db/db-context";
import { createTestApp, WEB_HEADERS } from "../test/create-test-app";

class ProbeBodyDto extends createZodDto(
  z.object({ name: z.string().min(2), phone: z.string().regex(/^\+\d{8,15}$/) }),
) {}

/** Test-only public endpoints that exercise the global pipeline (guards, pipes, interceptor, filter). */
@Public()
@Controller("test-probe")
class ProbeController {
  constructor(private readonly db: DbContext) {}

  /** What the database sees inside the request transaction. */
  @Get("context")
  async context() {
    const result = await this.db.tx.execute(sql`
      select current_user as role,
             app.current_user_id() as user_id,
             app.current_workspace_id() as workspace_id,
             app.current_client_id() as client_id,
             app.current_actor() as actor,
             (select count(*) from idempotency_keys)::int as visible_idempotency_keys
    `);
    return result.rows[0];
  }

  @Post("context")
  async contextAfterWrite(@Body() _body: unknown) {
    return this.context();
  }

  @Post("validate")
  validate(@Body() body: ProbeBodyDto) {
    return { ok: true, name: body.name };
  }

  @Post("duplicate")
  async duplicate() {
    await this.db.tx.execute(
      sql`do $$ begin raise unique_violation using message = 'duplicate key on "secret_index"'; end $$`,
    );
    return { unreachable: true };
  }

  @Get("boom")
  boom(): never {
    throw new Error("internal detail: password column missing");
  }
}

describe("request pipeline", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp([ProbeController]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("CSRF (PROMPT §12.2)", () => {
    it("allows reads without the CSRF header", async () => {
      const response = await request(app.getHttpServer()).get("/v1/test-probe/context");

      expect(response.status).toBe(200);
    });

    it("rejects a state-changing request without X-FitCoach-Request", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/test-probe/validate")
        .set("origin", WEB_HEADERS.origin)
        .send({ name: "Asha", phone: "+919876543210" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("CSRF_REJECTED");
    });

    it("rejects a state-changing request from another origin", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/test-probe/validate")
        .set({ ...WEB_HEADERS, origin: "https://evil.example" })
        .send({ name: "Asha", phone: "+919876543210" });

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("CSRF_REJECTED");
    });

    it("accepts it from the web origin with the header", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/test-probe/validate")
        .set(WEB_HEADERS)
        .send({ name: "Asha", phone: "+919876543210" });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ ok: true, name: "Asha" });
    });
  });

  describe("error contract (PROMPT §4.3)", () => {
    it("returns field errors for invalid input", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/test-probe/validate")
        .set(WEB_HEADERS)
        .send({ name: "A", phone: "98765" });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: "VALIDATION_FAILED",
        requestId: expect.any(String),
      });
      expect(Object.keys(response.body.fieldErrors)).toEqual(["name", "phone"]);
    });

    it("rejects malformed JSON with the contract", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/test-probe/validate")
        .set({ ...WEB_HEADERS, "content-type": "application/json" })
        .send("{not json");

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    });

    it("maps a unique violation to 409 without leaking SQL", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/test-probe/duplicate")
        .set(WEB_HEADERS);

      expect(response.status).toBe(409);
      expect(response.body.code).toBe("CONFLICT_DUPLICATE");
      expect(JSON.stringify(response.body)).not.toContain("secret_index");
    });

    it("hides unexpected errors behind a generic 500", async () => {
      const response = await request(app.getHttpServer()).get("/v1/test-probe/boom");

      expect(response.status).toBe(500);
      expect(response.body.code).toBe("INTERNAL_ERROR");
      expect(JSON.stringify(response.body)).not.toContain("password");
    });
  });

  describe("request id", () => {
    it("echoes a well-formed id from the web proxy in the header and error body", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/nope")
        .set("x-request-id", "req-1234abcd");

      expect(response.headers["x-request-id"]).toBe("req-1234abcd");
      expect(response.body.requestId).toBe("req-1234abcd");
    });

    it("replaces a malformed id instead of trusting it", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/nope")
        .set("x-request-id", "<script>");

      expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe("database context (PROMPT §4.3, CLAUDE.md rules 1 and 3)", () => {
    it("runs request queries as fitcoach_app with an empty context when there is no session", async () => {
      const response = await request(app.getHttpServer()).get("/v1/test-probe/context");

      expect(response.body).toEqual({
        role: "fitcoach_app",
        user_id: null,
        workspace_id: null,
        client_id: null,
        actor: null,
        visible_idempotency_keys: 0,
      });
    });

    it("ignores tenant ids supplied in headers, query or body (tampering)", async () => {
      const workspaceId = "11111111-1111-4111-8111-111111111111";
      const response = await request(app.getHttpServer())
        .post(`/v1/test-probe/context?workspace_id=${workspaceId}`)
        .set({ ...WEB_HEADERS, "x-workspace-id": workspaceId, "x-user-id": workspaceId })
        .send({ workspace_id: workspaceId, user_id: workspaceId, actor: "platform_owner" });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ user_id: null, workspace_id: null, actor: null });
    });
  });
});
