import { Controller, Get, Res } from "@nestjs/common";
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import type { LivenessResponse, ReadinessResponse } from "@fitcoach/shared";
import type { Response } from "express";
import { Public } from "../../common/auth/decorators";
import { SkipDbContext } from "../../db/db-context";
import { LivenessResponseDto, ReadinessResponseDto } from "./health.dto";
import { HealthService } from "./health.service";

/**
 * Health endpoints (PROMPT §17.5). Public, and neither touches tenant data, so no request transaction.
 */
@ApiTags("health")
@Public()
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
