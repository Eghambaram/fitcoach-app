import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ERROR_CODES } from "@fitcoach/shared";
import type { Request } from "express";
import { AppConfig } from "../../config/env";
import { SKIP_CSRF } from "../auth/decorators";
import { DomainError } from "../errors/domain-error";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Header the web client sends on every request; a cross-site form or image can't set it. */
export const CSRF_HEADER = "x-fitcoach-request";

/**
 * State-changing requests must come from the web origin and carry `X-FitCoach-Request: 1`
 * (PROMPT §12.2, CLAUDE.md rule 11). Runs before every other guard.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly config: AppConfig,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip === true) return true;

    const marker = request.headers[CSRF_HEADER];
    const origin = request.headers.origin;
    if (marker !== "1" || origin !== this.config.webOrigin) {
      throw new DomainError(
        ERROR_CODES.CSRF_REJECTED,
        403,
        "This request was blocked for your security. Reload the page and try again.",
      );
    }
    return true;
  }
}
