import { fromCm, fromKg, type LengthUnit, type UnitKind, type WeightUnit } from "@fitcoach/shared";

/** Display helpers for measurements (no React), usable from server and client components. */

export type Units = { weightUnit: WeightUnit; lengthUnit: LengthUnit };

/** A canonical value (kg, cm, %) in the viewer's units, as a number. */
export function display(value: number, kind: UnitKind, units: Units): number {
  if (kind === "mass") return fromKg(value, units.weightUnit);
  if (kind === "length") return fromCm(value, units.lengthUnit);
  return Math.round(value * 100) / 100;
}

export function unitLabel(kind: UnitKind, units: Units): string {
  if (kind === "mass") return units.weightUnit;
  if (kind === "length") return units.lengthUnit;
  if (kind === "percent") return "%";
  return "";
}

/** "72.5 kg", "18%", "12". */
export function formatValue(value: number, kind: UnitKind, units: Units): string {
  const unit = unitLabel(kind, units);
  const number = display(value, kind, units);
  if (!unit) return String(number);
  return kind === "percent" ? `${number}%` : `${number} ${unit}`;
}

/** "−2.4 kg", "+1 cm", "no change". */
export function formatChange(change: number, kind: UnitKind, units: Units): string {
  if (change === 0) return "no change";
  const magnitude = formatValue(Math.abs(change), kind, units);
  return `${change < 0 ? "−" : "+"}${magnitude}`;
}
