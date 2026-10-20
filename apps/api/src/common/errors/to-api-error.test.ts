import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ERROR_CODES } from "@fitcoach/shared";
import { ZodValidationException } from "nestjs-zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DomainError } from "./domain-error";
import { toApiError } from "./to-api-error";

function pgError(code: string, message = 'duplicate key value violates unique constraint "x"') {
  return Object.assign(new Error(message), {
    code,
    severity: "ERROR",
    detail: "Key (email)=(a@b.c)",
  });
}

describe("toApiError", () => {
  it("passes domain errors through with their code, message and field errors", () => {
    const mapped = toApiError(
      new DomainError(ERROR_CODES.PLAN_LIMIT, 422, "Your plan allows 50 active clients.", {
        status: ["Limit reached"],
      }),
    );

    expect(mapped).toEqual({
      status: 422,
      body: {
        code: "PLAN_LIMIT",
        message: "Your plan allows 50 active clients.",
        fieldErrors: { status: ["Limit reached"] },
      },
      unexpected: false,
    });
  });

  it("turns Zod validation failures into field errors keyed by path", () => {
    const schema = z.object({ name: z.string().min(2), address: z.object({ city: z.string() }) });
    const result = schema.safeParse({ name: "a", address: {} });
    if (result.success) throw new Error("expected failure");

    const mapped = toApiError(new ZodValidationException(result.error));

    expect(mapped.status).toBe(400);
    expect(mapped.body.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(mapped.body.fieldErrors ?? {})).toEqual(["name", "address.city"]);
  });

  it.each([
    ["23505", 409, "CONFLICT_DUPLICATE"],
    ["23P01", 409, "CONFLICT_APPOINTMENT"],
    ["23503", 422, "INVALID_REFERENCE"],
  ])("maps Postgres %s to %d %s without leaking SQL", (code, status, apiCode) => {
    const mapped = toApiError(pgError(code));

    expect(mapped.status).toBe(status);
    expect(mapped.body.code).toBe(apiCode);
    expect(JSON.stringify(mapped.body)).not.toMatch(/constraint|Key \(|a@b\.c/);
  });

  it("finds the Postgres error inside a Drizzle-style cause chain", () => {
    const wrapped = Object.assign(new Error("Failed query: insert into ..."), {
      cause: pgError("23505"),
    });

    expect(toApiError(wrapped).body.code).toBe("CONFLICT_DUPLICATE");
  });

  it("treats an RLS violation as forbidden and flags it as unexpected", () => {
    const mapped = toApiError(
      pgError("42501", 'new row violates row-level security policy for table "x"'),
    );

    expect(mapped).toMatchObject({ status: 403, body: { code: "FORBIDDEN" }, unexpected: true });
  });

  it("maps Nest HTTP exceptions to codes with generic messages", () => {
    expect(toApiError(new NotFoundException("Cannot GET /v1/secret-route"))).toMatchObject({
      status: 404,
      body: { code: "NOT_FOUND", message: "We couldn't find that." },
    });
    expect(toApiError(new BadRequestException()).body.code).toBe("VALIDATION_FAILED");
  });

  it("maps body-parser style errors by their status", () => {
    const tooLarge = Object.assign(new Error("request entity too large"), { status: 413 });

    expect(toApiError(tooLarge)).toMatchObject({
      status: 413,
      body: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("hides unknown errors behind a generic 500", () => {
    const mapped = toApiError(
      new TypeError("cannot read properties of undefined (reading 'password')"),
    );

    expect(mapped).toEqual({
      status: 500,
      body: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong on our side. Please try again.",
      },
      unexpected: true,
    });
  });
});
