/**
 * Unit conversion (D16, CLAUDE.md rule 19): values are stored in canonical units (kg, cm) and
 * converted for display with the workspace's preference.
 */
export type WeightUnit = "kg" | "lb";
export type LengthUnit = "cm" | "in";

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

/** Rounds to 2 decimals, the precision measurements are stored with. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toKg(value: number, unit: WeightUnit): number {
  return round2(unit === "kg" ? value : value * KG_PER_LB);
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return round2(unit === "kg" ? kg : kg / KG_PER_LB);
}

export function toCm(value: number, unit: LengthUnit): number {
  return round2(unit === "cm" ? value : value * CM_PER_IN);
}

export function fromCm(cm: number, unit: LengthUnit): number {
  return round2(unit === "cm" ? cm : cm / CM_PER_IN);
}
