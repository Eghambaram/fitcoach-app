import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { ApiAcceptedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { AcceptedResponse, MeResponse, OkResponse, SessionsResponse } from "@fitcoach/shared";
import type { Request, Response } from "express";
import { AllowInactiveWorkspace, Public, Roles } from "../../common/auth/decorators";
import { clearSessionCookie, setSessionCookie } from "../../common/auth/session-cookie";
import { hashIp } from "../../common/security/ip-hash";
import { AppConfig } from "../../config/env";
import {
  AcceptedResponseDto,
  EmailOnlyRequestDto,
  LoginRequestDto,
  MeResponseDto,
  OkResponseDto,
  ResetPasswordRequestDto,
  SessionIdParamDto,
  SessionsResponseDto,
  SignupRequestDto,
  TokenRequestDto,
} from "./auth.dto";
import { AuthService, type RequestMeta } from "./auth.service";

const ACCEPTED: AcceptedResponse = { status: "accepted" };
const OK: OkResponse = { ok: true };

/** Trainer auth (PROMPT §12.2, §15). Clients (4.1) and platform owners (6.1) get their own flows. */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  private meta(request: Request & { id?: unknown }): RequestMeta {
    const userAgent = request.headers["user-agent"];
    return {
      ipHash: hashIp(request.ip, this.config.ipHashSalt),
      userAgent: typeof userAgent === "string" ? userAgent.slice(0, 300) : undefined,
      requestId: typeof request.id === "string" ? request.id : undefined,
    };
  }

  /** Always 202, whether or not the email already has an account (non-enumerating). */
  @Public()
  @Post("signup")
  @HttpCode(202)
  @ApiAcceptedResponse({ type: AcceptedResponseDto })
  async signup(@Body() body: SignupRequestDto, @Req() request: Request): Promise<AcceptedResponse> {
    await this.auth.signup(body, this.meta(request));
    return ACCEPTED;
  }

  @Public()
  @Post("verify-email")
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  async verifyEmail(@Body() body: TokenRequestDto, @Req() request: Request): Promise<OkResponse> {
    await this.auth.verifyEmail(body.token, this.meta(request));
    return OK;
  }

  @Public()
  @Post("verify-email/resend")
  @HttpCode(202)
  @ApiAcceptedResponse({ type: AcceptedResponseDto })
  async resendVerification(
    @Body() body: EmailOnlyRequestDto,
    @Req() request: Request,
  ): Promise<AcceptedResponse> {
    await this.auth.resendVerification(body.email, this.meta(request));
    return ACCEPTED;
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  async login(
    @Body() body: LoginRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OkResponse> {
    const session = await this.auth.login(body, this.meta(request));
    setSessionCookie(response, session.token, session.expiresAt, this.config.secureCookies);
    return OK;
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  async logout(@Res({ passthrough: true }) response: Response): Promise<OkResponse> {
    await this.auth.logout();
    clearSessionCookie(response, this.config.secureCookies);
    return OK;
  }

  @Public()
  @Post("password/forgot")
  @HttpCode(202)
  @ApiAcceptedResponse({ type: AcceptedResponseDto })
  async forgotPassword(
    @Body() body: EmailOnlyRequestDto,
    @Req() request: Request,
  ): Promise<AcceptedResponse> {
    await this.auth.forgotPassword(body.email, this.meta(request));
    return ACCEPTED;
  }

  /** Signs every device out; the user signs in again with the new password. */
  @Public()
  @Post("password/reset")
  @HttpCode(200)
  @ApiOkResponse({ type: OkResponseDto })
  async resetPassword(
    @Body() body: ResetPasswordRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OkResponse> {
    await this.auth.resetPassword(body, this.meta(request));
    clearSessionCookie(response, this.config.secureCookies);
    return OK;
  }

  @Roles("trainer", "client", "platform_owner")
  @AllowInactiveWorkspace()
  @Get("me")
  @ApiOkResponse({ type: MeResponseDto })
  me(): Promise<MeResponse> {
    return this.auth.me();
  }

  @Roles("trainer", "client", "platform_owner")
  @AllowInactiveWorkspace()
  @Get("sessions")
  @ApiOkResponse({ type: SessionsResponseDto })
  listSessions(): Promise<SessionsResponse> {
    return this.auth.listSessions();
  }

  @Roles("trainer", "client", "platform_owner")
  @AllowInactiveWorkspace()
  @Delete("sessions/:id")
  @ApiOkResponse({ type: OkResponseDto })
  async revokeSession(
    @Param() params: SessionIdParamDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OkResponse> {
    const { current } = await this.auth.revokeSession(params.id);
    if (current) clearSessionCookie(response, this.config.secureCookies);
    return OK;
  }
}
