import { Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  dashboardQuerySchema,
  type DashboardSummary,
  dashboardSummarySchema,
  type OkResponse,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { Roles } from "../../common/auth/decorators";
import { OkResponseDto } from "../auth/auth.dto";
import { DashboardService } from "./dashboard.service";

class DashboardQueryDto extends createZodDto(dashboardQuerySchema) {}
class DashboardSummaryDto extends createZodDto(dashboardSummarySchema) {}

/** Trainer dashboard (PROMPT §8.1). */
@ApiTags("dashboard")
@Roles("trainer")
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** KPIs, schedule, needs attention, activity and the checklist in one call (no N+1). */
  @Get("summary")
  @ApiOkResponse({ type: DashboardSummaryDto })
  summary(@Query() query: DashboardQueryDto): Promise<DashboardSummary> {
    return this.dashboard.summary(query);
  }

  @Post("checklist/dismiss")
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  async dismissChecklist(): Promise<OkResponse> {
    await this.dashboard.dismissChecklist();
    return { ok: true };
  }
}
