/**
 * Money is stored as integer paise (CLAUDE.md rule 20a) — never floats.
 * Formatting uses integer arithmetic only, so large amounts stay exact.
 */

const PAISE_PER_RUPEE = 100n;

function toBigInt(paise: bigint | number): bigint {
  if (typeof paise === "bigint") return paise;
  if (!Number.isSafeInteger(paise)) {
    throw new RangeError(`Paise must be a safe integer, received ${paise}`);
  }
  return BigInt(paise);
}

/** Groups digits the Indian way: last three, then pairs (1234567 → "12,34,567"). */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const pairs = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${pairs},${lastThree}`;
}

/**
 * Formats paise as INR with Indian digit grouping.
 * Whole rupees omit decimals (₹1,23,456); otherwise two decimals are shown (₹1,23,456.50).
 */
export function formatInr(paise: bigint | number): string {
  const value = toBigInt(paise);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rupees = abs / PAISE_PER_RUPEE;
  const remainder = abs % PAISE_PER_RUPEE;
  const fraction = remainder === 0n ? "" : `.${remainder.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}₹${groupIndian(rupees.toString())}${fraction}`;
}

/** Converts whole rupees to paise, e.g. for a package preset price typed by the trainer. */
export function rupeesToPaise(rupees: bigint | number): bigint {
  return toBigInt(rupees) * PAISE_PER_RUPEE;
}
