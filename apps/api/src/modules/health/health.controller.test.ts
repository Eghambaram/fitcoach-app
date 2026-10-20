import type { ReadinessResponse } from "@fitcoach/shared";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "./health.controller";
import type { HealthService } from "./health.service";

function controllerWith(result: ReadinessResponse) {
  const health = { readiness: vi.fn(async () => result) } as unknown as HealthService;
  const response = { status: vi.fn() } as unknown as Response;
  return { controller: new HealthController(health), response };
}

describe("HealthController", () => {
  it("reports liveness without dependencies", () => {
    const { controller } = controllerWith({
      status: "ok",
      checks: { database: { status: "ok" }, jobs: { status: "ok" }, storage: { status: "ok" } },
    });

    expect(controller.liveness()).toEqual({ status: "ok" });
  });

  it("answers 200 when every dependency is ready", async () => {
    const { controller, response } = controllerWith({
      status: "ok",
      checks: {
        database: { status: "ok" },
        jobs: { status: "ok" },
        storage: { status: "not_configured" },
      },
    });

    await controller.readiness(response);

    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("answers 503 when a dependency is degraded", async () => {
    const { controller, response } = controllerWith({
      status: "degraded",
      checks: {
        database: { status: "degraded" },
        jobs: { status: "ok" },
        storage: { status: "not_configured" },
      },
    });

    const body = await controller.readiness(response);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(body.checks.database.status).toBe("degraded");
  });
});
