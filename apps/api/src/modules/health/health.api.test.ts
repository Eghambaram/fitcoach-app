import type { INestApplication } from "@nestjs/common";
import { readinessResponseSchema } from "@fitcoach/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApp } from "../../test/create-test-app";

describe("health endpoints", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /v1/health reports liveness", async () => {
    const response = await request(app.getHttpServer()).get("/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("GET /v1/health/ready reports the database, job queue and storage as OK", async () => {
    const response = await request(app.getHttpServer()).get("/v1/health/ready");

    expect(response.status).toBe(200);
    const body = readinessResponseSchema.parse(response.body);
    expect(body.status).toBe("ok");
    expect(body.checks.database.status).toBe("ok");
    expect(body.checks.jobs.status).toBe("ok");
    // Both buckets on the test RustFS container are reachable.
    expect(body.checks.storage.status).toBe("ok");
  });

  it("serves routes only under /v1 and answers unknown routes with the error contract", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: "NOT_FOUND",
      message: "We couldn't find that.",
      requestId: expect.any(String),
    });
  });

  it("sets security headers (helmet)", async () => {
    const response = await request(app.getHttpServer()).get("/v1/health");

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("serves the OpenAPI document outside production", async () => {
    const response = await request(app.getHttpServer()).get("/v1/docs-json");

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining(["/v1/health", "/v1/health/ready"]),
    );
  });
});
