import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
} from "@nestjs/common";
import { ApiAcceptedResponse, ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  acceptInviteRequestSchema,
  type AcceptedResponse,
  type ClientHomeResponse,
  clientHomeResponseSchema,
  type ClientMeResponse,
  clientMeResponseSchema,
  type ClientPortalScheduleResponse,
  clientPortalScheduleResponseSchema,
  type ClientProfileResponse,
  clientProfileResponseSchema,
  type ClientWorkoutResponse,
  clientWorkoutResponseSchema,
  finishWorkoutRequestSchema,
  type PortalWorkoutsResponse,
  portalWorkoutsResponseSchema,
  putWorkoutSetRequestSchema,
  updateClientFeaturesRequestSchema,
  updateClientPreferencesRequestSchema,
  createInviteRequestSchema,
  type CreateInviteResponse,
  createInviteResponseSchema,
  invitePreviewRequestSchema,
  type InvitePreviewResponse,
  invitePreviewResponseSchema,
  type OkResponse,
  type PortalAccess,
  portalAccessSchema,
  requestCodeRequestSchema,
  verifyCodeRequestSchema,
} from "@fitcoach/shared";
import type { Request, Response } from "express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { AllowInactiveWorkspace, Public, Roles } from "../../common/auth/decorators";
import { setSessionCookie } from "../../common/auth/session-cookie";
import { requestMeta } from "../../common/security/request-meta";
import { AppConfig } from "../../config/env";
import { AcceptedResponseDto, OkResponseDto } from "../auth/auth.dto";
import { ClientAuthService } from "./client-auth.service";
import { ClientPortalService } from "./client-portal.service";
import { PortalAccessService } from "./portal-access.service";

class PortalAccessDto extends createZodDto(portalAccessSchema) {}
class CreateInviteRequestDto extends createZodDto(createInviteRequestSchema) {}
class CreateInviteResponseDto extends createZodDto(createInviteResponseSchema) {}
class InvitePreviewRequestDto extends createZodDto(invitePreviewRequestSchema) {}
class InvitePreviewResponseDto extends createZodDto(invitePreviewResponseSchema) {}
class AcceptInviteRequestDto extends createZodDto(acceptInviteRequestSchema) {}
class RequestCodeRequestDto extends createZodDto(requestCodeRequestSchema) {}
class VerifyCodeRequestDto extends createZodDto(verifyCodeRequestSchema) {}
class ClientMeResponseDto extends createZodDto(clientMeResponseSchema) {}
class ClientHomeResponseDto extends createZodDto(clientHomeResponseSchema) {}
class PortalWorkoutsResponseDto extends createZodDto(portalWorkoutsResponseSchema) {}
class ClientWorkoutResponseDto extends createZodDto(clientWorkoutResponseSchema) {}
class ClientScheduleDto extends createZodDto(clientPortalScheduleResponseSchema) {}
class ClientProfileDto extends createZodDto(clientProfileResponseSchema) {}
class UpdatePreferencesDto extends createZodDto(updateClientPreferencesRequestSchema) {}
class UpdateFeaturesDto extends createZodDto(updateClientFeaturesRequestSchema) {}
class PutSetDto extends createZodDto(putWorkoutSetRequestSchema) {}
class FinishWorkoutDto extends createZodDto(finishWorkoutRequestSchema) {}
class IdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

const OK: OkResponse = { ok: true };

/** Trainer: a client's portal access (PROMPT §8.3, D19). */
@ApiTags("client-portal")
@Roles("trainer")
@Controller("clients/:id/portal")
export class PortalAccessController {
  constructor(private readonly access: PortalAccessService) {}

  @Get()
  @ApiOkResponse({ type: PortalAccessDto })
  get(@Param() params: IdParamDto): Promise<PortalAccess> {
    return this.access.get(params.id);
  }

  /** A new single-use invite link; older open links stop working. */
  @Post("invite")
  @HttpCode(200)
  @ApiOkResponse({ type: CreateInviteResponseDto })
  invite(
    @Param() params: IdParamDto,
    @Body() body: CreateInviteRequestDto,
  ): Promise<CreateInviteResponse> {
    return this.access.invite(params.id, body);
  }

  @Post("revoke")
  @HttpCode(200)
  @ApiOkResponse({ type: PortalAccessDto })
  revoke(@Param() params: IdParamDto): Promise<PortalAccess> {
    return this.access.revoke(params.id);
  }

  /** Per-client features (§8.3): e.g. let the client log their own workouts. */
  @Put("features")
  @ApiOkResponse({ type: PortalAccessDto })
  features(@Param() params: IdParamDto, @Body() body: UpdateFeaturesDto): Promise<PortalAccess> {
    return this.access.setFeatures(params.id, body);
  }
}

/** Client sign-in (PROMPT §12.2): invite link and email code. Public and rate-limited. */
@ApiTags("client-auth")
@Controller("client-auth")
export class ClientAuthController {
  constructor(
    private readonly auth: ClientAuthService,
    private readonly config: AppConfig,
  ) {}

  /** Who invited them (no client data); 400 when the link can't be used. */
  @Public()
  @Post("invite/preview")
  @HttpCode(200)
  @ApiOkResponse({ type: InvitePreviewResponseDto })
  preview(
    @Body() body: InvitePreviewRequestDto,
    @Req() request: Request,
  ): Promise<InvitePreviewResponse> {
    return this.auth.previewInvite(body.token, requestMeta(request, this.config.ipHashSalt));
  }

  @Public()
  @Post("invite/accept")
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  async accept(
    @Body() body: AcceptInviteRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OkResponse> {
    const session = await this.auth.acceptInvite(
      body,
      requestMeta(request, this.config.ipHashSalt),
    );
    setSessionCookie(response, session.token, session.expiresAt, this.config.secureCookies);
    return OK;
  }

  /** Always 202, whether or not the email belongs to a client (non-enumerating). */
  @Public()
  @Post("code")
  @HttpCode(202)
  @ApiAcceptedResponse({ type: AcceptedResponseDto })
  async requestCode(
    @Body() body: RequestCodeRequestDto,
    @Req() request: Request,
  ): Promise<AcceptedResponse> {
    await this.auth.requestCode(body.email, requestMeta(request, this.config.ipHashSalt));
    return { status: "accepted" };
  }

  @Public()
  @Post("code/verify")
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  async verifyCode(
    @Body() body: VerifyCodeRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OkResponse> {
    const session = await this.auth.verifyCode(body, requestMeta(request, this.config.ipHashSalt));
    setSessionCookie(response, session.token, session.expiresAt, this.config.secureCookies);
    return OK;
  }
}

/** Signed in as a client (PROMPT §9). */
@ApiTags("client")
@Roles("client")
@Controller("client")
export class ClientPortalController {
  constructor(private readonly portal: ClientPortalService) {}

  @AllowInactiveWorkspace()
  @Get("me")
  @ApiOkResponse({ type: ClientMeResponseDto })
  me(): Promise<ClientMeResponse> {
    return this.portal.me();
  }

  @AllowInactiveWorkspace()
  @Get("home")
  @ApiOkResponse({ type: ClientHomeResponseDto })
  home(): Promise<ClientHomeResponse> {
    return this.portal.home();
  }

  @AllowInactiveWorkspace()
  @Get("workouts")
  @ApiOkResponse({ type: PortalWorkoutsResponseDto })
  workouts(): Promise<PortalWorkoutsResponse> {
    return this.portal.workoutList();
  }

  @AllowInactiveWorkspace()
  @Get("workouts/:id")
  @ApiOkResponse({ type: ClientWorkoutResponseDto })
  workout(@Param() params: IdParamDto): Promise<ClientWorkoutResponse> {
    return this.portal.workout(params.id);
  }

  /** Self-logging only (the trainer turns it on per client). */
  @Post("workouts/:id/start")
  @HttpCode(200)
  @ApiOkResponse({ type: ClientWorkoutResponseDto })
  start(@Param() params: IdParamDto): Promise<ClientWorkoutResponse> {
    return this.portal.startWorkout(params.id);
  }

  /** Idempotent upsert of one set; the id is generated on the device. */
  @Put("workout-sets/:id")
  @ApiOkResponse({ type: ClientWorkoutResponseDto })
  putSet(@Param() params: IdParamDto, @Body() body: PutSetDto): Promise<ClientWorkoutResponse> {
    return this.portal.putSet(params.id, body);
  }

  @Post("workouts/:id/finish")
  @HttpCode(200)
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "UUID per user intent" })
  @ApiOkResponse({ type: ClientWorkoutResponseDto })
  finish(
    @Param() params: IdParamDto,
    @Body() body: FinishWorkoutDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ): Promise<ClientWorkoutResponse> {
    return this.portal.finishWorkout(params.id, body, idempotencyKey);
  }

  @AllowInactiveWorkspace()
  @Get("schedule")
  @ApiOkResponse({ type: ClientScheduleDto })
  schedule(): Promise<ClientPortalScheduleResponse> {
    return this.portal.schedule();
  }

  @AllowInactiveWorkspace()
  @Get("profile")
  @ApiOkResponse({ type: ClientProfileDto })
  profile(): Promise<ClientProfileResponse> {
    return this.portal.profile();
  }

  @Put("profile/preferences")
  @ApiOkResponse({ type: ClientProfileDto })
  preferences(@Body() body: UpdatePreferencesDto): Promise<ClientProfileResponse> {
    return this.portal.updatePreferences(body);
  }
}
