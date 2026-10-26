"use client";

import type { InitialPackage } from "@fitcoach/shared";
import Link from "next/link";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { presetSummary } from "../settings/package-presets";
import { usePackagePresets } from "./package-forms";
import { RupeeInput } from "./package-display";

/** The picker's value: a preset and a price (paise), or nothing ("No package yet"). */
export type InitialPackageValue = { presetId: string; pricePaise: number | undefined } | null;

/** The request field for a picked package, or undefined when none was picked. */
export function initialPackageBody(value: InitialPackageValue): InitialPackage | undefined {
  return value
    ? { presetId: value.presetId, pricePaise: value.pricePaise ?? Number.NaN }
    : undefined;
}

/**
 * Initial package while converting a lead or onboarding a client (§8.3A): a preset and its price,
 * sold in the same request. Anything custom is sold later from the client's Packages tab.
 */
export function InitialPackageFields({
  value,
  onChange,
  error,
}: {
  value: InitialPackageValue;
  onChange: (next: InitialPackageValue) => void;
  error?: string;
}) {
  const presets = usePackagePresets();
  const picked = presets.data?.find((preset) => preset.id === value?.presetId);
  const none = presets.isSuccess && presets.data.length === 0;
  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Initial package (optional)"
        error={value ? undefined : error}
        hint={
          presets.isError ? (
            "We couldn't load your packages. You can sell one from their profile later."
          ) : none ? (
            <>
              No package presets yet.{" "}
              <Link href="/app/settings/packages" className="underline">
                Add one in Settings
              </Link>
              , or sell a package from their profile later.
            </>
          ) : picked ? (
            presetSummary(picked)
          ) : undefined
        }
      >
        <Select
          value={value?.presetId ?? ""}
          disabled={presets.isPending || none}
          onChange={(event) => {
            const preset = presets.data?.find((item) => item.id === event.target.value);
            onChange(
              preset
                ? { presetId: preset.id, pricePaise: preset.defaultPricePaise ?? undefined }
                : null,
            );
          }}
        >
          <option value="">{presets.isPending ? "Loading packages…" : "No package yet"}</option>
          {(presets.data ?? []).map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </Select>
      </Field>
      {value ? (
        <Field label="Price (₹)" error={error} required>
          <RupeeInput
            value={value.pricePaise}
            onValueChange={(pricePaise) => onChange({ ...value, pricePaise })}
          />
        </Field>
      ) : null}
    </div>
  );
}
