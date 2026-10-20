import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../app.setup";

describe("GET /v1/health", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports liveness without touching the database", async () => {
    const response = await request(app.getHttpServer()).get("/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("serves routes only under the /v1 prefix", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(404);
  });
});
