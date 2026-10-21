import { describe, expect, it } from "vitest";
import { normaliseNullableTypes } from "./app.setup";

describe("OpenAPI nullable normalisation", () => {
  it("turns 2020-12 type arrays into OpenAPI 3.0 nullable scalars, at any depth", () => {
    expect(
      normaliseNullableTypes({
        properties: {
          headline: { type: ["string", "null"] },
          tags: { type: "array", items: { type: "string" } },
          nested: { anyOf: [{ type: ["integer", "null"] }] },
        },
      }),
    ).toEqual({
      properties: {
        headline: { type: "string", nullable: true },
        tags: { type: "array", items: { type: "string" } },
        nested: { anyOf: [{ type: "integer", nullable: true }] },
      },
    });
  });
});
