import { describe, expect, it } from "vitest";
import { checkFormToken, issueFormToken, MAX_FORM_AGE_MS, MIN_FILL_MS } from "./form-token";

const SECRET = "test-secret-0123456789abcdef0123456789";
const WORKSPACE = "6f1c0c43-0a51-4d55-9a6f-1d1c5f1e9a10";

describe("enquiry form token", () => {
  const issued = 1_800_000_000_000;
  const token = issueFormToken(SECRET, WORKSPACE, issued);

  it("accepts a form filled in at human speed", () => {
    expect(checkFormToken(SECRET, WORKSPACE, token, issued + MIN_FILL_MS)).toBe("ok");
  });

  it("flags submissions faster than a person could type", () => {
    expect(checkFormToken(SECRET, WORKSPACE, token, issued + 500)).toBe("too_fast");
  });

  it("expires a day-old form", () => {
    expect(checkFormToken(SECRET, WORKSPACE, token, issued + MAX_FORM_AGE_MS + 1)).toBe("expired");
  });

  it("rejects forged times, other workspaces and other secrets", () => {
    const [, sig] = token.split(".");
    expect(checkFormToken(SECRET, WORKSPACE, `${issued - 60_000}.${sig}`, issued + 5_000)).toBe(
      "invalid",
    );
    expect(
      checkFormToken(SECRET, "0d4b5c2e-1111-4a2b-8c3d-000000000000", token, issued + 5_000),
    ).toBe("invalid");
    expect(checkFormToken(`${SECRET}x`, WORKSPACE, token, issued + 5_000)).toBe("invalid");
    expect(checkFormToken(SECRET, WORKSPACE, "garbage", issued + 5_000)).toBe("invalid");
    expect(checkFormToken(SECRET, WORKSPACE, `${token}.x`, issued + 5_000)).toBe("invalid");
  });
});
