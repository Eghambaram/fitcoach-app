import { describe, expect, it } from "vitest";
import { formatInr, rupeesToPaise } from "./money";

describe("formatInr", () => {
  it.each([
    [0, "₹0"],
    [100, "₹1"],
    [99_900, "₹999"],
    [100_000, "₹1,000"],
    [12_345_600, "₹1,23,456"],
    [1_234_567_800, "₹1,23,45,678"],
  ])("formats %d paise as %s", (paise, expected) => {
    expect(formatInr(paise)).toBe(expected);
  });

  it("shows two decimals only when there are paise", () => {
    expect(formatInr(12_345_650)).toBe("₹1,23,456.50");
    expect(formatInr(105)).toBe("₹1.05");
  });

  it("formats negative amounts (e.g. a voided payment)", () => {
    expect(formatInr(-49_900)).toBe("-₹499");
  });

  it("stays exact beyond Number.MAX_SAFE_INTEGER when given a bigint", () => {
    // 9007199254740993 rupees is MAX_SAFE_INTEGER + 2 — a Number would round the last digit.
    expect(formatInr(900_719_925_474_099_312n)).toBe("₹9,00,71,99,25,47,40,993.12");
  });

  it("rejects non-integer numbers instead of rounding silently", () => {
    expect(() => formatInr(10.5)).toThrow(RangeError);
  });
});

describe("rupeesToPaise", () => {
  it("multiplies by 100 as a bigint", () => {
    expect(rupeesToPaise(499)).toBe(49_900n);
  });
});
