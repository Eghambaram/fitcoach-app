import { Controller, Get, Res } from "@nestjs/common";
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import type { LivenessResponse, ReadinessResponse } from "@fitcoach/shared";
import type { Response } from "express";
import { SkipDbContext } from "../../db/db-context";
import { LivenessResponseDto, ReadinessResponseDto } from "./health.dto";
import { HealthService } from "./health.service";

/**
 * Health endpoints (PROMPT §17.5). Neither touches tenant data, so no request transaction is opened.
 * The session guard (step 1.3) will mark this controller `@Public()`.
 */
@ApiTags("health")
@SkipDbContext()
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Liveness for Railway deploy checks — no DB, so a deploy isn't blocked by a slow database. */
  @Get()
  @ApiOkResponse({ type: LivenessResponseDto })
  liveness(): LivenessResponse {
    return { status: "ok" };
  }

  /** Readiness for smoke tests and Platform Health: database, jobs, storage. 503 when degraded. */
  @Get("ready")
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({ type: ReadinessResponseDto })
  async readiness(@Res({ passthrough: true }) response: Response): Promise<ReadinessResponse> {
    const result = await this.health.readiness();
    response.status(result.status === "ok" ? 200 : 503);
    return result;
  }
}
