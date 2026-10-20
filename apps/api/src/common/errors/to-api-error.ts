import { HttpException } from "@nestjs/common";
import { type ApiError, ERROR_CODES, type ErrorCode } from "@fitcoach/shared";
import { ZodValidationException } from "nestjs-zod";
import { DomainError } from "./domain-error";

export interface MappedError {
  status: number;
  body: Omit<ApiError, "requestId">;
  /** True when the failure is ours (bug or outage) and must be logged with the stack. */
  unexpected: boolean;
}

const GENERIC_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: "Some details need fixing.",
  CSRF_REJECTED: "This request was blocked for your security. Reload the page and try again.",
  UNAUTHENTICATED: "Please sign in to continue.",
  FORBIDDEN: "You don't have access to this.",
  NOT_FOUND: "We couldn't find that.",
  METHOD_NOT_ALLOWED: "That action isn't supported here.",
  PAYLOAD_TOO_LARGE: "That's too large to upload or save.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  CONFLICT_DUPLICATE: "This already exists.",
  CONFLICT_APPOINTMENT: "This time overlaps another appointment.",
  INVALID_REFERENCE: "Something this depends on no longer exists.",
  PLAN_LIMIT: "You've reached the limit of your plan.",
  WORKSPACE_READ_ONLY: "This workspace is read-only right now.",
  INTERNAL_ERROR: "Something went wrong on our side. Please try again.",
};

function generic(code: ErrorCode, status: number, unexpected = false): MappedError {
  return { status, body: { code, message: GENERIC_MESSAGES[code] }, unexpected };
}

/** Postgres SQLSTATE codes we translate (PROMPT §4.3). Anything else is an unexpected 500. */
const PG_ERRORS: Record<string, () => MappedError> = {
  "23505": () => generic(ERROR_CODES.CONFLICT_DUPLICATE, 409),
  "23P01": () => generic(ERROR_CODES.CONFLICT_APPOINTMENT, 409),
  "23503": () => generic(ERROR_CODES.INVALID_REFERENCE, 422),
  // insufficient_privilege, incl. "new row violates row-level security policy": a guard should have
  // stopped this first, so it is logged as unexpected but shown as a plain 403.
  "42501": () => ({ ...generic(ERROR_CODES.FORBIDDEN, 403), unexpected: true }),
};

const STATUS_CODES: Record<number, ErrorCode> = {
  400: ERROR_CODES.VALIDATION_FAILED,
  401: ERROR_CODES.UNAUTHENTICATED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.NOT_FOUND,
  405: ERROR_CODES.METHOD_NOT_ALLOWED,
  413: ERROR_CODES.PAYLOAD_TOO_LARGE,
  429: ERROR_CODES.RATE_LIMITED,
};

/** Drizzle wraps driver errors; walk the `cause` chain to find the Postgres one. */
function findPgCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && current !== null) {
      const candidate = current as { code?: unknown; severity?: unknown; cause?: unknown };
      if (
        typeof candidate.code === "string" &&
        /^[0-9A-Z]{5}$/.test(candidate.code) &&
        candidate.severity
      ) {
        return candidate.code;
      }
      current = candidate.cause;
    } else {
      return undefined;
    }
  }
  return undefined;
}

function zodFieldErrors(exception: ZodValidationException): Record<string, string[]> {
  const zodError = exception.getZodError() as {
    issues?: { path: PropertyKey[]; message: string }[];
  };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of zodError.issues ?? []) {
    const key = issue.path.map(String).join(".") || "_root";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/** Status-bearing errors thrown by Express middleware (e.g. body-parser's malformed JSON / too large). */
function httpStatusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const value = typeof status === "number" ? status : statusCode;
  return typeof value === "number" && value >= 400 && value < 600 ? value : undefined;
}

/**
 * Maps anything thrown during a request to the public error contract.
 * Never leaks SQL, stack traces or internal messages (PROMPT §4.3).
 */
export function toApiError(exception: unknown): MappedError {
  if (exception instanceof DomainError) {
    return {
      status: exception.status,
      body: {
        code: exception.code,
        message: exception.message,
        ...(exception.fieldErrors ? { fieldErrors: exception.fieldErrors } : {}),
      },
      unexpected: false,
    };
  }

  if (exception instanceof ZodValidationException) {
    return {
      status: 400,
      body: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: GENERIC_MESSAGES.VALIDATION_FAILED,
        fieldErrors: zodFieldErrors(exception),
      },
      unexpected: false,
    };
  }

  const pgCode = findPgCode(exception);
  if (pgCode) {
    return PG_ERRORS[pgCode]?.() ?? generic(ERROR_CODES.INTERNAL_ERROR, 500, true);
  }

  const status =
    exception instanceof HttpException ? exception.getStatus() : httpStatusOf(exception);
  if (status !== undefined) {
    if (status >= 500) return generic(ERROR_CODES.INTERNAL_ERROR, 500, true);
    return generic(STATUS_CODES[status] ?? ERROR_CODES.VALIDATION_FAILED, status);
  }

  return generic(ERROR_CODES.INTERNAL_ERROR, 500, true);
}
