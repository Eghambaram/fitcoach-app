import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  type OkResponse,
  type PlatformAuthStatus,
  platformAuthStatusSchema,
  platformLoginRequestSchema,
  type PlatformLoginResponse,
  platformLoginResponseSchema,
  platformMfaEnableRequestSchema,
  type PlatformMfaEnableResponse,
  platformMfaEnableResponseSchema,
  type PlatformMfaSetupResponse,
  platformMfaSetupResponseSchema,
  platformMfaVerifyRequestSchema,
} from "@fitcoach/shared";
import type { Request, Response } from "express";
import { createZodDto } from "nestjs-zod";
import { AllowAal1, Public, Roles } from "../../common/auth/decorators";
import { setSessionCookie } from "../../common/auth/session-cookie";
import { requestMeta } from "../../common/security/request-meta";
import { AppConfig } from "../../config/env";
import { SkipDbContext } from "../../db/db-context";
import { OkResponseDto } from "../auth/auth.dto";
import { PlatformAuthService } from "./platform-auth.service";

class PlatformAuthStatusDto extends createZodDto(platformAuthStatusSchema) {}
class PlatformLoginRequestDto extends createZodDto(platformLoginRequestSchema) {}
class PlatformLoginResponseDto extends createZodDto(platformLoginResponseSchema) {}
class PlatformMfaSetupResponseDto extends createZodDto(platformMfaSetupResponseSchema) {}
class PlatformMfaEnableRequestDto extends createZodDto(platformMfaEnableRequestSchema) {}
class PlatformMfaEnableResponseDto extends createZodDto(platformMfaEnableResponseSchema) {}
class PlatformMfaVerifyRequestDto extends createZodDto(platformMfaVerifyRequestSchema) {}

/**
 * `/platform/login` (PROMPT §16.0): password first, then the authenticator. Separate from the
 * trainer login; MFA is never optional for platform owners. Everything here uses SystemDb.
 */
@ApiTags("platform")
@SkipDbContext()
@Controller("platform/auth")
export class PlatformAuthController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOkResponse({ type: PlatformLoginResponseDto })
  async login(
    @Body() body: PlatformLoginRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PlatformLoginResponse> {
    const { session, next } = await this.auth.login(
      body,
      requestMeta(request, this.config.ipHashSalt),
    );
    setSessionCookie(response, session.token, session.expiresAt, this.config.secureCookies);
    return { next };
  }

  @Roles("platform_owner")
  @AllowAal1()
  @Get("status")
  @ApiOkResponse({ type: PlatformAuthStatusDto })
  status(): Promise<PlatformAuthStatus> {
    return this.auth.status();
  }

  @Roles("platform_owner")
  @AllowAal1()
  @Get("mfa/setup")
  @ApiOkResponse({ type: PlatformMfaSetupResponseDto })
  setup(): Promise<PlatformMfaSetupResponse> {
    return this.auth.setup();
  }

  @Roles("platform_owner")
  @AllowAal1()
  @Post("mfa/enable")
  @HttpCode(200)
  @ApiOkResponse({ type: PlatformMfaEnableResponseDto })
  enable(
    @Body() body: PlatformMfaEnableRequestDto,
    @Req() request: Request,
  ): Promise<PlatformMfaEnableResponse> {
    return this.auth.enable(body.code, requestMeta(request, this.config.ipHashSalt));
  }

  @Roles("platform_owner")
  @AllowAal1()
  @Post("mfa/verify")
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  async verify(
    @Body() body: PlatformMfaVerifyRequestDto,
    @Req() request: Request,
  ): Promise<OkResponse> {
    await this.auth.verify(body, requestMeta(request, this.config.ipHashSalt));
    return { ok: true };
  }
}
