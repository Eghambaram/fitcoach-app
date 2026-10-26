import { z } from "zod";
import { PACKAGE_KINDS } from "../messaging";

/**
 * Client packages, sessions and manually recorded payments (PROMPT §8.3A, step 3.2). Money is
 * integer paise (CLAUDE.md rule 20a). Clients never see prices, amounts or payments (rule 20c).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const optionalDate = isoDate.nullable();
const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional();

/** ₹10,00,000 — far above any package, low enough to catch a mistyped extra digit. */
export const MAX_PACKAGE_PRICE_PAISE = 100_000_000;
const paise = (label: string) =>
  z
    .number(`Enter the ${label}`)
    .int(`Enter the ${label} in whole paise`)
    .min(0, `The ${label} can't be negative`)
    .max(MAX_PACKAGE_PRICE_PAISE, `That ${label} looks too high`);

export const PACKAGE_STATUSES = ["active", "completed", "expired", "cancelled"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];
export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  active: "Active",
  completed: "Completed",
  expired: "Expired",
  cancelled: "Cancelled",
};

export const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

export const LEDGER_REASONS = ["attended", "no_show", "late_cancel", "manual_adjustment"] as const;
export type LedgerReason = (typeof LEDGER_REASONS)[number];

// ---------------------------------------------------------------------------------------------
// Selling and renewing
// ---------------------------------------------------------------------------------------------

/**
 * Sell a package, or renew: selling while another package is active closes that one (completed, or
 * expired when past its expiry date). Name, kind and sessions may come from a preset.
 */
export const sellPackageRequestSchema = z
  .object({
    presetId: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Enter a name").max(80),
    kind: z.enum(PACKAGE_KINDS),
    sessionsIncluded: z
      .number("Enter a number")
      .int("Use a whole number")
      .min(1, "Use 1 or more")
      .max(500, "Use 500 or less")
      .nullable(),
    /** Shown on the card for time-based packages; never enforced (ADR-0031). */
    sessionsPerWeek: z
      .number("Enter a number")
      .int("Use a whole number")
      .min(1, "Use 1 or more")
      .max(14, "Use 14 or less")
      .nullable(),
    startsOn: isoDate,
    expiresOn: optionalDate,
    pricePaise: paise("price"),
    /** What the client owes for it; below the price for a discount. */
    amountDuePaise: paise("amount due"),
    paymentDueOn: optionalDate,
    notes: optionalText(500),
  })
  .superRefine((input, ctx) => {
    if (input.kind === "session_pack" && input.sessionsIncluded === null) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionsIncluded"],
        message: "A session pack needs a number of sessions",
      });
    }
    if (input.expiresOn !== null && input.expiresOn < input.startsOn) {
      ctx.addIssue({ code: "custom", path: ["expiresOn"], message: "End after the start date" });
    }
    if (input.amountDuePaise > input.pricePaise) {
      ctx.addIssue({
        code: "custom",
        path: ["amountDuePaise"],
        message: "The amount due can't be more than the price",
      });
    }
  });
export type SellPackageRequest = z.infer<typeof sellPackageRequestSchema>;

/**
 * The quick version used while converting a lead or onboarding a client: a preset and its price.
 * Name, kind, sessions and expiry come from the preset; the amount due is the price.
 */
export const initialPackageSchema = z.object({
  presetId: z.string().uuid("Choose a package"),
  pricePaise: paise("price"),
  /** Defaults to the coaching start date, or today. */
  startsOn: isoDate.optional(),
});
export type InitialPackage = z.infer<typeof initialPackageSchema>;

export const recordPaymentRequestSchema = z.object({
  amountPaise: paise("amount").min(1, "Enter an amount above zero"),
  method: z.enum(PAYMENT_METHODS),
  paidOn: isoDate,
  reference: optionalText(80),
  note: optionalText(300),
});
export type RecordPaymentRequest = z.infer<typeof recordPaymentRequestSchema>;

export const voidPaymentRequestSchema = z.object({
  reason: z.string().trim().min(1, "Say why it's being voided").max(200),
});
export type VoidPaymentRequest = z.infer<typeof voidPaymentRequestSchema>;

/** Positive uses sessions, negative gives sessions back. A note is required (§8.3A). */
export const sessionAdjustmentRequestSchema = z.object({
  sessions: z
    .number("Enter a number")
    .int("Use a whole number")
    .min(-50, "Use -50 or more")
    .max(50, "Use 50 or less")
    .refine((value) => value !== 0, "Use a number other than 0"),
  note: z.string().trim().min(1, "Add a note saying why").max(300),
});
export type SessionAdjustmentRequest = z.infer<typeof sessionAdjustmentRequestSchema>;

export const cancelPackageRequestSchema = z.object({
  reason: z.string().trim().min(1, "Say why it's being cancelled").max(200),
});
export type CancelPackageRequest = z.infer<typeof cancelPackageRequestSchema>;

// ---------------------------------------------------------------------------------------------
// Trainer views
// ---------------------------------------------------------------------------------------------

export const packageSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.enum(PACKAGE_KINDS),
  /** `expired` is shown as soon as the expiry date has passed, even before the package is closed. */
  status: z.enum(PACKAGE_STATUSES),
  sessionsIncluded: z.number().int().nullable(),
  /** Net sessions used: deductions minus reversals and give-backs. */
  sessionsUsed: z.number().int(),
  /** Null for time-based and online packages, which never deduct (ADR-0031). */
  sessionsLeft: z.number().int().nullable(),
  sessionsPerWeek: z.number().int().nullable(),
  startsOn: z.string().max(10),
  expiresOn: z.string().max(10).nullable(),
  pricePaise: z.number().int(),
  amountDuePaise: z.number().int(),
  paidPaise: z.number().int(),
  /** amount due − valid payments (never below zero). */
  balancePaise: z.number().int(),
  paymentDueOn: z.string().max(10).nullable(),
  /** A balance is left and the payment due date has passed (or is today). */
  paymentOverdue: z.boolean(),
  notes: z.string().nullable(),
  closedReason: z.string().nullable(),
  createdAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
});
export type PackageSummary = z.infer<typeof packageSummarySchema>;

export const paymentSchema = z.object({
  id: z.string().uuid(),
  packageId: z.string().uuid(),
  packageName: z.string(),
  amountPaise: z.number().int(),
  method: z.enum(PAYMENT_METHODS),
  paidOn: z.string().max(10),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  voided: z.object({ at: z.string().datetime(), reason: z.string() }).nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const ledgerEntrySchema = z.object({
  id: z.string().uuid(),
  packageId: z.string().uuid(),
  reason: z.enum(LEDGER_REASONS),
  /** +1 used a session, 0 recorded without using one, negative gave sessions back. */
  sessionsUsed: z.number().int(),
  /** This row undoes an earlier one (attendance was un-marked). */
  reversal: z.boolean(),
  appointment: z
    .object({ id: z.string().uuid(), date: z.string().max(10), startTime: z.string().max(5) })
    .nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const clientPackagesResponseSchema = z.object({
  active: packageSummarySchema.nullable(),
  /** Earlier packages, newest first. */
  history: z.array(packageSummarySchema),
  payments: z.array(paymentSchema),
  /** Session use on the active package, newest first. */
  ledger: z.array(ledgerEntrySchema),
  /** Workspace setting: at or below this many sessions left a package counts as running low. */
  lowSessionsThreshold: z.number().int(),
});
export type ClientPackagesResponse = z.infer<typeof clientPackagesResponseSchema>;

/** The package card on the client overview (trainer only). */
export const packageCardSchema = packageSummarySchema.pick({
  id: true,
  name: true,
  kind: true,
  status: true,
  sessionsIncluded: true,
  sessionsUsed: true,
  sessionsLeft: true,
  sessionsPerWeek: true,
  expiresOn: true,
  balancePaise: true,
  paymentDueOn: true,
  paymentOverdue: true,
});
export type PackageCard = z.infer<typeof packageCardSchema>;

/**
 * What a client may see about their own package (§8.3A, CLAUDE.md rule 20c): sessions left and
 * expiry only. Strict, so a price or payment field can never slip into a portal response.
 */
export const clientPortalPackageSchema = z
  .object({
    name: z.string(),
    kind: z.enum(PACKAGE_KINDS),
    sessionsLeft: z.number().int().nullable(),
    sessionsIncluded: z.number().int().nullable(),
    expiresOn: z.string().max(10).nullable(),
  })
  .strict();
export type ClientPortalPackage = z.infer<typeof clientPortalPackageSchema>;
