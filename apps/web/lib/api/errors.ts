import { type ApiError, apiErrorSchema } from "@fitcoach/shared";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

/** A failed API call, carrying the error contract `{ code, message, fieldErrors?, requestId }`. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.message);
    this.name = "ApiRequestError";
  }

  get code() {
    return this.body.code;
  }
}

const UNREACHABLE: ApiError = {
  code: "INTERNAL_ERROR",
  message: "We couldn't reach FitCoach. Check your connection and try again.",
  requestId: "",
};

const UNEXPECTED: ApiError = {
  code: "INTERNAL_ERROR",
  message: "Something went wrong on our side. Please try again.",
  requestId: "",
};

/**
 * Turns an error response into an ApiRequestError the UI can show. Status 0 means the request never
 * got an answer (offline, DNS, proxy down); a body outside the contract is treated as unexpected.
 */
export function toApiRequestError(status: number, body: unknown): ApiRequestError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) return new ApiRequestError(status, parsed.data);
  return new ApiRequestError(status, status === 0 ? UNREACHABLE : UNEXPECTED);
}

/**
 * Applies API field errors to a React Hook Form (CLAUDE.md rule 26) for the field paths the form
 * knows. Returns the paths it couldn't place, so the caller can show them some other way.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: ApiRequestError,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): string[] {
  const unplaced: string[] = [];
  for (const [path, messages] of Object.entries(error.body.fieldErrors ?? {})) {
    if (knownFields.includes(path)) {
      setError(path as Path<T>, { type: "server", message: messages[0] });
    } else {
      unplaced.push(path);
    }
  }
  return unplaced;
}
