import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ERROR_CODES } from "@fitcoach/shared";
import type { Request } from "express";
import { ClsService } from "nestjs-cls";
import { SessionsService } from "../../modules/auth/sessions.service";
import { DomainError } from "../errors/domain-error";
import type { Actor, AppClsStore } from "../request-context";
import { ALLOW_INACTIVE_WORKSPACE, IS_PUBLIC, ROLES } from "./decorators";
import { readSessionCookie } from "./session-cookie";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const WRITABLE_WORKSPACE_STATUSES = new Set(["trialing", "active", "past_due"]);

function isPublic(reflector: Reflector, context: ExecutionContext): boolean {
  return (
    reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]) ===
    true
  );
}

/**
 * Resolves the `fc_session` cookie into the request's auth context (PROMPT §4.3). This is the only
 * place AuthContext is created. Non-public routes without a valid session get 401.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = readSessionCookie(request);
    if (token) {
      const session = await this.sessions.resolve(token);
      if (session) {
        this.cls.set("auth", {
          userId: session.userId,
          actor: session.actor,
          workspaceId: session.workspaceId,
          clientId: null,
          sessionId: session.id,
          workspaceStatus: session.workspaceStatus,
        });
      }
    }

    if (!this.cls.get("auth") && !isPublic(this.reflector, context)) {
      throw new DomainError(ERROR_CODES.UNAUTHENTICATED, 401, "Please sign in to continue.");
    }
    return true;
  }
}

/** Checks the actor against `@Roles(...)`. Fails closed: a non-public route without `@Roles` is refused. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublic(this.reflector, context)) return true;
    const roles = this.reflector.getAllAndOverride<Actor[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    const actor = this.cls.get("auth")?.actor;
    if (!roles || !actor || !roles.includes(actor)) {
      throw DomainError.forbidden();
    }
    return true;
  }
}

/**
 * Applies the trainer's workspace status (PROMPT §16.0): suspended = read-only; pending approval or
 * cancelled = only routes marked `@AllowInactiveWorkspace()`.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const auth = this.cls.get("auth");
    if (!auth || auth.actor !== "trainer" || isPublic(this.reflector, context)) return true;

    const status = auth.workspaceStatus;
    if (status && WRITABLE_WORKSPACE_STATUSES.has(status)) return true;

    const allowInactive =
      this.reflector.getAllAndOverride<boolean>(ALLOW_INACTIVE_WORKSPACE, [
        context.getHandler(),
        context.getClass(),
      ]) === true;
    if (allowInactive) return true;

    const method = context.switchToHttp().getRequest<Request>().method;
    if (status === "suspended") {
      if (SAFE_METHODS.has(method)) return true;
      throw new DomainError(
        ERROR_CODES.WORKSPACE_READ_ONLY,
        403,
        "Your workspace is suspended, so it's read-only for now. You can still export your data.",
      );
    }
    throw new DomainError(
      ERROR_CODES.WORKSPACE_INACTIVE,
      403,
      status === "pending_approval"
        ? "Your account is waiting for approval. We'll email you when it's ready."
        : "This workspace isn't active.",
    );
  }
}
