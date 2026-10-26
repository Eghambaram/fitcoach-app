import { describe, expect, it } from "vitest";
import {
  clientPortalPackageSchema,
  recordPaymentRequestSchema,
  sellPackageRequestSchema,
  sessionAdjustmentRequestSchema,
} from "./packages";

const pack = {
  name: "12 sessions",
  kind: "session_pack",
  sessionsIncluded: 12,
  sessionsPerWeek: null,
  startsOn: "2031-01-01",
  expiresOn: "2031-02-11",
  pricePaise: 1_200_000,
  amountDuePaise: 1_000_000,
  paymentDueOn: null,
} as const;

const fieldErrors = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join(".")) ?? [];

describe("package contracts (§8.3A)", () => {
  it("accepts a discounted session pack and refuses impossible ones", () => {
    expect(sellPackageRequestSchema.safeParse(pack).success).toBe(true);
    expect(
      fieldErrors(sellPackageRequestSchema.safeParse({ ...pack, sessionsIncluded: null })),
    ).toEqual(["sessionsIncluded"]);
    expect(
      fieldErrors(sellPackageRequestSchema.safeParse({ ...pack, expiresOn: "2030-12-31" })),
    ).toEqual(["expiresOn"]);
    expect(
      fieldErrors(sellPackageRequestSchema.safeParse({ ...pack, amountDuePaise: 1_300_000 })),
    ).toEqual(["amountDuePaise"]);
    expect(fieldErrors(sellPackageRequestSchema.safeParse({ ...pack, pricePaise: 10.5 }))).toEqual([
      "pricePaise",
    ]);
  });

  it("needs a positive payment and a non-zero, noted adjustment", () => {
    const payment = { amountPaise: 50_000, method: "upi", paidOn: "2031-01-02" };
    expect(recordPaymentRequestSchema.safeParse(payment).success).toBe(true);
    expect(recordPaymentRequestSchema.safeParse({ ...payment, amountPaise: 0 }).success).toBe(
      false,
    );
    expect(sessionAdjustmentRequestSchema.safeParse({ sessions: 0, note: "x" }).success).toBe(
      false,
    );
    expect(sessionAdjustmentRequestSchema.safeParse({ sessions: -1, note: " " }).success).toBe(
      false,
    );
    expect(sessionAdjustmentRequestSchema.safeParse({ sessions: -1, note: "Gift" }).success).toBe(
      true,
    );
  });

  it("never lets a price, amount or payment into what a client sees (rule 20c)", () => {
    const portal = {
      name: "12 sessions",
      kind: "session_pack",
      sessionsLeft: 8,
      sessionsIncluded: 12,
      expiresOn: "2031-02-11",
    };
    expect(clientPortalPackageSchema.safeParse(portal).success).toBe(true);
    for (const leak of ["pricePaise", "amountDuePaise", "balancePaise", "payments"]) {
      expect(clientPortalPackageSchema.safeParse({ ...portal, [leak]: 0 }).success).toBe(false);
    }
  });
});
