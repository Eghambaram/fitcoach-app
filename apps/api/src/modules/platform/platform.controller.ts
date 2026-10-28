import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  type BetaInvite,
  betaInviteSchema,
  createBetaInviteRequestSchema,
  type CreateBetaInviteResponse,
  createBetaInviteResponseSchema,
  type OkResponse,
  type PlatformAuditListResponse,
  platformAuditListResponseSchema,
  platformAuditQuerySchema,
  type PlatformFeedbackListResponse,
  platformFeedbackListResponseSchema,
  platformFeedbackQuerySchema,
  platformFeedbackUpdateSchema,
  type PlatformHealth,
  platformHealthSchema,
  type PlatformOverview,
  platformOverviewSchema,
  platformPlanUpdateSchema,
  platformReasonSchema,
  type PlatformTrainerDetail,
  platformTrainerDetailSchema,
  type PlatformTrainerListResponse,
  platformTrainerListResponseSchema,
  platformTrainerQuerySchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { Roles } from "../../common/auth/decorators";
import { SkipDbContext } from "../../db/db-context";
import { OkResponseDto } from "../auth/auth.dto";
import { PlatformOpsService } from "./platform-ops.service";
import { PlatformTrainersService } from "./platform-trainers.service";

class PlatformOverviewDto extends createZodDto(platformOverviewSchema) {}
class PlatformTrainerQueryDto extends createZodDto(platformTrainerQuerySchema) {}
class PlatformTrainerListDto extends createZodDto(platformTrainerListResponseSchema) {}
class PlatformTrainerDetailDto extends createZodDto(platformTrainerDetailSchema) {}
class PlatformReasonDto extends createZodDto(platformReasonSchema) {}
class PlatformPlanUpdateDto extends createZodDto(platformPlanUpdateSchema) {}
class PlatformBetaInviteListDto extends createZodDto(
  z.object({ items: z.array(betaInviteSchema) }),
) {}
class PlatformCreateInviteDto extends createZodDto(createBetaInviteRequestSchema) {}
class PlatformCreateInviteResponseDto extends createZodDto(createBetaInviteResponseSchema) {}
class PlatformFeedbackQueryDto extends createZodDto(platformFeedbackQuerySchema) {}
class PlatformFeedbackListDto extends createZodDto(platformFeedbackListResponseSchema) {}
class PlatformFeedbackUpdateDto extends createZodDto(platformFeedbackUpdateSchema) {}
class PlatformHealthDto extends createZodDto(platformHealthSchema) {}
class PlatformAuditQueryDto extends createZodDto(platformAuditQuerySchema) {}
class PlatformAuditListDto extends createZodDto(platformAuditListResponseSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

/**
 * Platform owner admin (PROMPT §16.0). `@Roles("platform_owner")` keeps trainers and clients out,
 * and PlatformMfaGuard requires AAL2 (password + TOTP) for every route here. Data goes through
 * SystemDb in the services, so no request transaction is opened.
 */
@ApiTags("platform")
@Roles("platform_owner")
@SkipDbContext()
@Controller("platform")
export class PlatformController {
  constructor(
    private readonly trainers: PlatformTrainersService,
    private readonly ops: PlatformOpsService,
  ) {}

  /** The /platform layout's access check: 401/403 for anyone else, MFA_REQUIRED before the code. */
  @Get("access")
  @ApiOkResponse({ type: OkResponseDto })
  access(): OkResponse {
    return { ok: true };
  }

  @Get("overview")
  @ApiOkResponse({ type: PlatformOverviewDto })
  overview(): Promise<PlatformOverview> {
    return this.trainers.overview();
  }

  @Get("trainers")
  @ApiOkResponse({ type: PlatformTrainerListDto })
  listTrainers(@Query() query: PlatformTrainerQueryDto): Promise<PlatformTrainerListResponse> {
    return this.trainers.list(query);
  }

  @Get("trainers/:id")
  @ApiOkResponse({ type: PlatformTrainerDetailDto })
  trainer(@Param() params: IdParamDto): Promise<PlatformTrainerDetail> {
    return this.trainers.detail(params.id);
  }

  @Post("trainers/:id/approve")
  @HttpCode(200)
  @ApiOkResponse({ type: PlatformTrainerDetailDto })
  approve(@Param() params: IdParamDto): Promise<PlatformTrainerDetail> {
    return this.trainers.approve(params.id);
  }

  @Patch("trainers/:id/plan")
  @ApiOkResponse({ type: PlatformTrainerDetailDto })
  plan(
    @Param() params: IdParamDto,
    @Body() body: PlatformPlanUpdateDto,
  ): Promise<PlatformTrainerDetail> {
    return this.trainers.updatePlan(params.id, body);
  }

  @Post("trainers/:id/suspend")
  @HttpCode(200)
  @ApiOkResponse({ type: PlatformTrainerDetailDto })
  suspend(
    @Param() params: IdParamDto,
    @Body() body: PlatformReasonDto,
  ): Promise<PlatformTrainerDetail> {
    return this.trainers.suspend(params.id, body.reason);
  }

  @Post("trainers/:id/reactivate")
  @HttpCode(200)
  @ApiOkResponse({ type: PlatformTrainerDetailDto })
  reactivate(
    @Param() params: IdParamDto,
    @Body() body: PlatformReasonDto,
  ): Promise<PlatformTrainerDetail> {
    return this.trainers.reactivate(params.id, body.reason);
  }

  @Post("trainers/:id/password-reset")
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  async passwordReset(@Param() params: IdParamDto): Promise<OkResponse> {
    await this.trainers.sendPasswordReset(params.id);
    return { ok: true };
  }

  @Post("trainers/:id/revoke-sessions")
  @HttpCode(200)
  @ApiOkResponse({ type: PlatformTrainerDetailDto })
  revokeSessions(@Param() params: IdParamDto): Promise<PlatformTrainerDetail> {
    return this.trainers.revokeSessions(params.id);
  }

  @Get("beta-invites")
  @ApiOkResponse({ type: PlatformBetaInviteListDto })
  async invites(): Promise<{ items: BetaInvite[] }> {
    return { items: await this.ops.invites() };
  }

  @Post("beta-invites")
  @ApiOkResponse({ type: PlatformCreateInviteResponseDto })
  createInvite(@Body() body: PlatformCreateInviteDto): Promise<CreateBetaInviteResponse> {
    return this.ops.createInvite(body);
  }

  @Delete("beta-invites/:id")
  @ApiOkResponse({ type: PlatformBetaInviteListDto })
  async revokeInvite(@Param() params: IdParamDto): Promise<{ items: BetaInvite[] }> {
    return { items: await this.ops.revokeInvite(params.id) };
  }

  @Get("feedback")
  @ApiOkResponse({ type: PlatformFeedbackListDto })
  feedback(@Query() query: PlatformFeedbackQueryDto): Promise<PlatformFeedbackListResponse> {
    return this.ops.feedback(query.status);
  }

  @Patch("feedback/:id")
  @ApiOkResponse({ type: OkResponseDto })
  async updateFeedback(
    @Param() params: IdParamDto,
    @Body() body: PlatformFeedbackUpdateDto,
  ): Promise<OkResponse> {
    await this.ops.updateFeedback(params.id, body.status);
    return { ok: true };
  }

  @Get("health")
  @ApiOkResponse({ type: PlatformHealthDto })
  health(): Promise<PlatformHealth> {
    return this.ops.health();
  }

  @Get("audit-logs")
  @ApiOkResponse({ type: PlatformAuditListDto })
  audit(@Query() query: PlatformAuditQueryDto): Promise<PlatformAuditListResponse> {
    return this.ops.audit(query);
  }
}
