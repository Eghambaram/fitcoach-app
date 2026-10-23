import { z } from "zod";

/**
 * Stable error codes returned by the API (PROMPT §4.3, CLAUDE.md rule 26).
 * The web maps them to field errors / toasts; never rename a published code.
 */
export const ERROR_CODES = {
  VALIDATION_FAILED: "VALIDATION_FAILED",
  CSRF_REJECTED: "CSRF_REJECTED",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  TOKEN_INVALID: "TOKEN_INVALID",
  /** The public enquiry form changed or its token expired since the page was loaded: reload. */
  FORM_OUTDATED: "FORM_OUTDATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  STORAGE_FULL: "STORAGE_FULL",
  STORAGE_NOT_CONFIGURED: "STORAGE_NOT_CONFIGURED",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT_DUPLICATE: "CONFLICT_DUPLICATE",
  CONFLICT_APPOINTMENT: "CONFLICT_APPOINTMENT",
  /** The action does not fit the current state (e.g. deleting a lead with history). */
  CONFLICT_STATE: "CONFLICT_STATE",
  INVALID_REFERENCE: "INVALID_REFERENCE",
  PLAN_LIMIT: "PLAN_LIMIT",
  /** The same Idempotency-Key was reused for a different request body. */
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  WORKSPACE_READ_ONLY: "WORKSPACE_READ_ONLY",
  WORKSPACE_INACTIVE: "WORKSPACE_INACTIVE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export const errorCodeSchema = z.enum(Object.values(ERROR_CODES) as [ErrorCode, ...ErrorCode[]]);

/** Body of every non-2xx API response. `fieldErrors` keys are dotted input paths ("phone", "address.city"). */
export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.string(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
