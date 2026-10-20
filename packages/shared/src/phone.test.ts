import { describe, expect, it } from "vitest";
import { normalizePhone, toWhatsAppNumber } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["098765-43210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
    ["+44 7911 123456", "+447911123456"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("uses the given default country for national numbers", () => {
    expect(normalizePhone("07911 123456", "GB")).toBe("+447911123456");
  });

  it.each(["12345", "not a phone", ""])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("toWhatsAppNumber", () => {
  it("strips the plus sign for wa.me", () => {
    expect(toWhatsAppNumber("+919876543210")).toBe("919876543210");
  });
});
