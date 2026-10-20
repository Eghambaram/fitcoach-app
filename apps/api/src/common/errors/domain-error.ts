import { ERROR_CODES, type ErrorCode } from "@fitcoach/shared";

/**
 * An expected, user-facing failure. Services throw these; the exception filter turns them into the
 * error contract `{ code, message, fieldErrors?, requestId }` (PROMPT §4.3).
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "DomainError";
  }

  static forbidden(message = "You don't have access to this."): DomainError {
    return new DomainError(ERROR_CODES.FORBIDDEN, 403, message);
  }

  static notFound(message = "We couldn't find that."): DomainError {
    return new DomainError(ERROR_CODES.NOT_FOUND, 404, message);
  }
}
