import {
  acceptedResponseSchema,
  emailOnlyRequestSchema,
  loginRequestSchema,
  meResponseSchema,
  okResponseSchema,
  resetPasswordRequestSchema,
  sessionsResponseSchema,
  signupRequestSchema,
  tokenRequestSchema,
} from "@fitcoach/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export class SignupRequestDto extends createZodDto(signupRequestSchema) {}
export class LoginRequestDto extends createZodDto(loginRequestSchema) {}
export class EmailOnlyRequestDto extends createZodDto(emailOnlyRequestSchema) {}
export class TokenRequestDto extends createZodDto(tokenRequestSchema) {}
export class ResetPasswordRequestDto extends createZodDto(resetPasswordRequestSchema) {}
export class SessionIdParamDto extends createZodDto(z.object({ id: z.string().uuid() })) {}

export class AcceptedResponseDto extends createZodDto(acceptedResponseSchema) {}
export class OkResponseDto extends createZodDto(okResponseSchema) {}
export class MeResponseDto extends createZodDto(meResponseSchema) {}
export class SessionsResponseDto extends createZodDto(sessionsResponseSchema) {}
