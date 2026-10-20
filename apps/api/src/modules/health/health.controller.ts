import { Controller, Get } from "@nestjs/common";

export interface LivenessResponse {
  status: "ok";
}

/**
 * Liveness only — no database access, so Railway deploy health checks pass as soon as the process is up (PROMPT §17.5).
 * `/v1/health/ready` (DB, pg-boss, storage) is added in step 1.2 together with the guard stack and `@Public()`.
 */
@Controller("health")
export class HealthController {
  @Get()
  liveness(): LivenessResponse {
    return { status: "ok" };
  }
}
