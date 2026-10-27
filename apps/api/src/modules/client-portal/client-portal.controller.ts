import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { ApiAcceptedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  acceptInviteRequestSchema,
  type AcceptedResponse,
  type ClientMeResponse,
  clientMeResponseSchema,
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
}
