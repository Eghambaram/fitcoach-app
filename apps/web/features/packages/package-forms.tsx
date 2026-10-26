"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ClientPackagesResponse,
  formatInr,
  PACKAGE_KIND_LABELS,
  PACKAGE_KINDS,
  type PackageSummary,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type RecordPaymentRequest,
  recordPaymentRequestSchema,
  type SellPackageRequest,
  sellPackageRequestSchema,
  type SessionAdjustmentRequest,
  sessionAdjustmentRequestSchema,
} from "@fitcoach/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, type DefaultValues, useForm, useWatch } from "react-hook-form";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { presetSummary } from "../settings/package-presets";
import { RupeeInput, todayIso } from "./package-display";

/** YYYY-MM-DD + n days (UTC steps, so no time zone shifts the day). */
function addDays(day: string, days: number): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Empty → null. RHF also passes the untouched default (null), and Number(null) would be 0. */
const optionalNumber = {
  setValueAs: (value: unknown) =>
    value === "" || value === null || value === undefined ? null : Number(value),
};
const optionalDate = {
  setValueAs: (value: unknown) => (value === "" || value === undefined ? null : value),
};

export function usePackagePresets() {
  return useQuery({
    queryKey: ["package-presets"],
    queryFn: () => unwrap(browserApi.GET("/v1/settings/package-presets")),
    select: (data) => data.presets.filter((preset) => !preset.archived),
  });
}

function Problem({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm font-medium text-danger">
      {message}
    </p>
  ) : null;
}

const SELL_FIELDS = [
  "presetId",
  "name",
  "kind",
  "sessionsIncluded",
  "sessionsPerWeek",
  "startsOn",
  "expiresOn",
  "pricePaise",
  "amountDuePaise",
  "paymentDueOn",
  "notes",
] as const;

/**
 * Sell / renew package sheet (§8.3A). Picking a preset fills the rest; everything stays editable.
 * Renewing closes the current package in the same request. One Idempotency-Key per opening.
 */
export function SellPackageForm({
  clientId,
  current,
  onSold,
}: {
  clientId: string;
  current: PackageSummary | null;
  onSold: (next: ClientPackagesResponse) => void;
}) {
  const online = useOnline();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [problem, setProblem] = useState<string | null>(null);
  const presets = usePackagePresets();
  const today = todayIso();
  const form = useForm<SellPackageRequest>({
    resolver: zodResolver(sellPackageRequestSchema),
    defaultValues: {
      name: "",
      kind: "session_pack",
      sessionsIncluded: null,
      sessionsPerWeek: null,
      startsOn: today,
      expiresOn: null,
      paymentDueOn: null,
    } satisfies DefaultValues<SellPackageRequest>,
  });
  const { register, handleSubmit, formState, setError, setValue, getValues, control } = form;
  const errors = formState.errors;
  const kind = useWatch({ control, name: "kind" });

  const sell = useMutation({
    mutationFn: (body: SellPackageRequest) =>
      unwrap(
        browserApi.POST("/v1/clients/{id}/packages", {
          params: { path: { id: clientId }, header: { "Idempotency-Key": idempotencyKey } },
          body,
        }),
      ),
    onSuccess: onSold,
    onError: (failure) => {
      if (failure instanceof ApiRequestError && failure.body.fieldErrors) {
        applyFieldErrors(failure, setError, SELL_FIELDS);
      }
      setProblem(failure.message);
    },
  });

  function applyPreset(id: string) {
    const preset = presets.data?.find((item) => item.id === id);
    setValue("presetId", preset ? preset.id : undefined);
    if (!preset) return;
    setValue("name", preset.name);
    setValue("kind", preset.kind);
    setValue("sessionsIncluded", preset.sessionsIncluded);
    setValue("sessionsPerWeek", preset.sessionsPerWeek);
    const start = getValues("startsOn") || today;
    setValue("expiresOn", preset.durationDays ? addDays(start, preset.durationDays - 1) : null);
    if (preset.defaultPricePaise !== null) {
      setValue("pricePaise", preset.defaultPricePaise);
      setValue("amountDuePaise", preset.defaultPricePaise);
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((body) => {
        setProblem(null);
        sell.mutate(body);
      })}
    >
      {current ? (
        <p className="rounded-control bg-info-soft p-3 text-sm">
          Renewing closes <span className="font-semibold">{current.name}</span>
          {current.sessionsLeft ? ` (${current.sessionsLeft} sessions unused)` : ""}. Its history
          and payments stay.
        </p>
      ) : null}
      <Field
        label="Start from a preset"
        hint={
          presets.isError ? "We couldn't load your presets; fill in the package below." : undefined
        }
      >
        <Select defaultValue="" onChange={(event) => applyPreset(event.target.value)}>
          <option value="">Custom package</option>
          {(presets.data ?? []).map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} ({presetSummary(preset)})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Name" error={errors.name?.message} required>
        <Input maxLength={80} placeholder="e.g. 12 sessions" {...register("name")} />
      </Field>
      <Field label="Type" error={errors.kind?.message} required>
        <Select {...register("kind")}>
          {PACKAGE_KINDS.map((value) => (
            <option key={value} value={value}>
              {PACKAGE_KIND_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      {kind === "session_pack" ? (
        <Field label="Sessions" error={errors.sessionsIncluded?.message} required>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            {...register("sessionsIncluded", optionalNumber)}
          />
        </Field>
      ) : (
        <Field
          label="Sessions per week (optional)"
          error={errors.sessionsPerWeek?.message}
          hint="Shown on the package card; FitCoach doesn't count or limit them."
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            {...register("sessionsPerWeek", optionalNumber)}
          />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" error={errors.startsOn?.message} required>
          <Input type="date" {...register("startsOn")} />
        </Field>
        <Field label="Expires (optional)" error={errors.expiresOn?.message}>
          <Input type="date" {...register("expiresOn", optionalDate)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name="pricePaise"
          render={({ field }) => (
            <Field label="Price (₹)" error={errors.pricePaise?.message} required>
              <RupeeInput
                value={field.value}
                onBlur={field.onBlur}
                onValueChange={(paise) => {
                  // The amount due follows the price until it's changed on its own (a discount).
                  const due = getValues("amountDuePaise");
                  if (due === undefined || due === field.value) {
                    setValue("amountDuePaise", paise as number);
                  }
                  field.onChange(paise);
                }}
              />
            </Field>
          )}
        />
        <Controller
          control={control}
          name="amountDuePaise"
          render={({ field }) => (
            <Field
              label="Amount due (₹)"
              error={errors.amountDuePaise?.message}
              hint="Lower than the price for a discount."
              required
            >
              <RupeeInput
                value={field.value}
                onBlur={field.onBlur}
                onValueChange={field.onChange}
              />
            </Field>
          )}
        />
      </div>
      <Field label="Payment due by (optional)" error={errors.paymentDueOn?.message}>
        <Input type="date" {...register("paymentDueOn", optionalDate)} />
      </Field>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        <Textarea rows={2} maxLength={500} {...register("notes")} />
      </Field>
      <Problem message={problem} />
      <Button type="submit" loading={sell.isPending} disabled={!online || sell.isSuccess}>
        {current ? "Renew package" : "Sell package"}
      </Button>
    </form>
  );
}

const PAYMENT_FIELDS = ["amountPaise", "method", "paidOn", "reference", "note"] as const;

/** Record payment sheet (§8.3A). Recorded manually: FitCoach never takes the money. */
export function RecordPaymentForm({
  packageId,
  packageName,
  balancePaise,
  onSaved,
}: {
  packageId: string;
  packageName: string;
  balancePaise: number;
  onSaved: (next: ClientPackagesResponse) => void;
}) {
  const online = useOnline();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [problem, setProblem] = useState<string | null>(null);
  const form = useForm<RecordPaymentRequest>({
    resolver: zodResolver(recordPaymentRequestSchema),
    defaultValues: { amountPaise: balancePaise, method: "upi", paidOn: todayIso() },
  });
  const { register, handleSubmit, formState, setError, control } = form;
  const errors = formState.errors;
  const record = useMutation({
    mutationFn: (body: RecordPaymentRequest) =>
      unwrap(
        browserApi.POST("/v1/packages/{id}/payments", {
          params: { path: { id: packageId }, header: { "Idempotency-Key": idempotencyKey } },
          body,
        }),
      ),
    onSuccess: onSaved,
    onError: (failure) => {
      if (failure instanceof ApiRequestError && failure.body.fieldErrors) {
        applyFieldErrors(failure, setError, PAYMENT_FIELDS);
      }
      setProblem(failure.message);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((body) => {
        setProblem(null);
        record.mutate(body);
      })}
    >
      <p className="text-sm text-muted-foreground">
        {packageName} · {formatInr(balancePaise)} due. Record money you&apos;ve received; FitCoach
        doesn&apos;t take payments.
      </p>
      <Controller
        control={control}
        name="amountPaise"
        render={({ field }) => (
          <Field label="Amount (₹)" error={errors.amountPaise?.message} required>
            <RupeeInput value={field.value} onBlur={field.onBlur} onValueChange={field.onChange} />
          </Field>
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Method" error={errors.method?.message} required>
          <Select {...register("method")}>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Paid on" error={errors.paidOn?.message} required>
          <Input type="date" {...register("paidOn")} />
        </Field>
      </div>
      <Field label="Reference (optional)" error={errors.reference?.message} hint="e.g. UPI ref">
        <Input maxLength={80} {...register("reference")} />
      </Field>
      <Field label="Note (optional)" error={errors.note?.message}>
        <Input maxLength={300} {...register("note")} />
      </Field>
      <Problem message={problem} />
      <Button type="submit" loading={record.isPending} disabled={!online || record.isSuccess}>
        Record payment
      </Button>
    </form>
  );
}

/** Manual session adjustment (§8.3A): use or give back sessions, always with a note. */
export function AdjustSessionsForm({
  packageId,
  sessionsLeft,
  sessionsUsed,
  onSaved,
}: {
  packageId: string;
  sessionsLeft: number;
  sessionsUsed: number;
  onSaved: (next: ClientPackagesResponse) => void;
}) {
  const online = useOnline();
  const [direction, setDirection] = useState<"use" | "give_back">("use");
  const [problem, setProblem] = useState<string | null>(null);
  const form = useForm<{ count: number; note: string }>({ defaultValues: { count: 1, note: "" } });
  const { register, handleSubmit, formState, setError } = form;
  const errors = formState.errors;
  const adjust = useMutation({
    mutationFn: (body: SessionAdjustmentRequest) =>
      unwrap(
        browserApi.POST("/v1/packages/{id}/adjustments", {
          params: { path: { id: packageId } },
          body,
        }),
      ),
    onSuccess: onSaved,
    onError: (failure) => setProblem(failure.message),
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(({ count, note }) => {
        setProblem(null);
        const parsed = sessionAdjustmentRequestSchema.safeParse({
          sessions: direction === "use" ? count : -count,
          note,
        });
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            setError(issue.path[0] === "note" ? "note" : "count", { message: issue.message });
          }
          return;
        }
        adjust.mutate(parsed.data);
      })}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">What happened?</legend>
        {(
          [
            ["use", `Use sessions (${sessionsLeft} left)`],
            ["give_back", `Give sessions back (${sessionsUsed} used)`],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name="adjust-direction"
              className="size-4 accent-charcoal"
              checked={direction === value}
              onChange={() => setDirection(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <Field label="How many sessions" error={errors.count?.message} required>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          {...register("count", { valueAsNumber: true })}
        />
      </Field>
      <Field
        label="Note"
        error={errors.note?.message}
        hint="Say why, e.g. “Session before FitCoach”."
        required
      >
        <Input maxLength={300} {...register("note")} />
      </Field>
      <Problem message={problem} />
      <Button type="submit" variant="dark" loading={adjust.isPending} disabled={!online}>
        Save adjustment
      </Button>
    </form>
  );
}
