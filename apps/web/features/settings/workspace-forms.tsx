"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CHECK_IN_FREQUENCIES,
  type CheckInRules,
  checkInRulesSchema,
  LENGTH_UNITS,
  type LocaleSettings,
  localeSettingsSchema,
  type PackagePolicy,
  packagePolicySchema,
  WEIGHT_UNITS,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { type FieldValues, type Path, type UseFormSetError, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { useTimeZones } from "@/lib/time-zones";

const whole = { valueAsNumber: true } as const;

/** Save → toast → refresh, with API field errors mapped back onto the form. */
function useSave<T extends FieldValues>(
  request: (body: T) => Promise<unknown>,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
) {
  const router = useRouter();
  return useMutation({
    mutationFn: request,
    onSuccess: () => {
      toast.success("Saved.");
      router.refresh();
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body.fieldErrors) {
        applyFieldErrors(error, setError, fields);
      } else {
        toast.error(error.message);
      }
    },
  });
}

function FormCard({
  title,
  description,
  pending,
  canSave,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  pending: boolean;
  canSave: boolean;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const online = useOnline();
  return (
    <Card className="p-5">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-5"
      >
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {children}
        <div className="flex justify-end">
          <Button type="submit" variant="dark" loading={pending} disabled={!online || !canSave}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------

export function PackagePolicyForm({ value }: { value: PackagePolicy }) {
  const form = useForm<PackagePolicy>({
    resolver: zodResolver(packagePolicySchema),
    defaultValues: value,
  });
  const { register, handleSubmit, formState, setError } = form;
  const errors = formState.errors;
  const save = useSave(
    (body: PackagePolicy) => unwrap(browserApi.PUT("/v1/settings/package-policy", { body })),
    setError,
    [
      "noShowUsesSession",
      "lateCancelWindowHours",
      "lateCancelUsesSession",
      "lowSessionsThreshold",
      "expiryWarningDays",
    ],
  );

  return (
    <FormCard
      title="No-shows, late cancellations and alerts"
      description="Applied when you mark attendance on a session from a package."
      pending={save.isPending}
      canSave={formState.isDirty}
      onSubmit={handleSubmit((body) => save.mutate(body))}
    >
      <label className="flex items-center gap-3 text-sm">
        <Checkbox {...register("noShowUsesSession")} />A no-show uses up a session
      </label>
      <label className="flex items-center gap-3 text-sm">
        <Checkbox {...register("lateCancelUsesSession")} />A late cancellation uses up a session
      </label>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field
          label="Late if cancelled within (hours)"
          error={errors.lateCancelWindowHours?.message}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={168}
            {...register("lateCancelWindowHours", whole)}
          />
        </Field>
        <Field
          label="Low sessions alert at"
          error={errors.lowSessionsThreshold?.message}
          hint="Sessions left"
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            {...register("lowSessionsThreshold", whole)}
          />
        </Field>
        <Field
          label="Expiry warning"
          error={errors.expiryWarningDays?.message}
          hint="Days before a package ends"
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={60}
            {...register("expiryWarningDays", whole)}
          />
        </Field>
      </div>
    </FormCard>
  );
}

// ---------------------------------------------------------------------------------------------

export function CheckInRulesForm({ value }: { value: CheckInRules }) {
  const form = useForm<CheckInRules>({
    resolver: zodResolver(checkInRulesSchema),
    defaultValues: value,
  });
  const { register, handleSubmit, formState, setError } = form;
  const errors = formState.errors;
  const save = useSave(
    (body: CheckInRules) => unwrap(browserApi.PUT("/v1/settings/check-ins", { body })),
    setError,
    ["checkInFrequency", "noCheckInDays", "noMeasurementDays"],
  );

  return (
    <FormCard
      title="Check-ins & attention"
      description="How often clients check in, and when a client shows up under “Needs attention”."
      pending={save.isPending}
      canSave={formState.isDirty}
      onSubmit={handleSubmit((body) => save.mutate(body))}
    >
      <Field label="Clients check in" error={errors.checkInFrequency?.message}>
        <Select {...register("checkInFrequency")}>
          {CHECK_IN_FREQUENCIES.map((frequency) => (
            <option key={frequency} value={frequency}>
              {frequency === "daily" ? "Daily" : "Weekly"}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Flag after no check-in for (days)" error={errors.noCheckInDays?.message}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={60}
            {...register("noCheckInDays", whole)}
          />
        </Field>
        <Field
          label="Flag after no measurement for (days)"
          error={errors.noMeasurementDays?.message}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={180}
            {...register("noMeasurementDays", whole)}
          />
        </Field>
      </div>
    </FormCard>
  );
}

// ---------------------------------------------------------------------------------------------

/** Countries offered for phone numbers and defaults; the workspace's current one is always listed. */
const COUNTRIES = ["IN", "AE", "AU", "CA", "GB", "NZ", "QA", "SA", "SG", "US"];

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function LocaleForm({ value }: { value: LocaleSettings }) {
  const timeZones = useTimeZones();
  const zones = timeZones.includes(value.timezone) ? timeZones : [value.timezone, ...timeZones];
  const countries = COUNTRIES.includes(value.country) ? COUNTRIES : [value.country, ...COUNTRIES];
  const form = useForm<LocaleSettings>({
    resolver: zodResolver(localeSettingsSchema),
    defaultValues: value,
  });
  const { register, handleSubmit, formState, setError } = form;
  const errors = formState.errors;
  const save = useSave(
    (body: LocaleSettings) => unwrap(browserApi.PUT("/v1/settings/locale", { body })),
    setError,
    ["weightUnit", "lengthUnit", "timezone", "country"],
  );

  return (
    <FormCard
      title="Units & locale"
      description="Measurements are stored in kg and cm and shown in your units."
      pending={save.isPending}
      canSave={formState.isDirty}
      onSubmit={handleSubmit((body) => save.mutate(body))}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Weight" error={errors.weightUnit?.message}>
          <Select {...register("weightUnit")}>
            {WEIGHT_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit === "kg" ? "Kilograms (kg)" : "Pounds (lb)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Length" error={errors.lengthUnit?.message}>
          <Select {...register("lengthUnit")}>
            {LENGTH_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {unit === "cm" ? "Centimetres (cm)" : "Inches (in)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Time zone"
          error={errors.timezone?.message}
          hint="Used for today's schedule, overdue items and reminders."
        >
          <Select {...register("timezone")}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Country"
          error={errors.country?.message}
          hint="Phone numbers without a country code are read as this country's."
        >
          <Select {...register("country")}>
            {countries.map((code) => (
              <option key={code} value={code}>
                {countryName(code)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </FormCard>
  );
}
