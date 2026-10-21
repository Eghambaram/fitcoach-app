"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  formatInr,
  PACKAGE_KIND_LABELS,
  PACKAGE_KINDS,
  type PackagePreset,
  type PackagePresetInput,
  packagePresetInputSchema,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Drawer } from "@/components/shared/overlays";
import { EmptyState, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";

const PRESET_FIELDS = [
  "name",
  "kind",
  "sessionsIncluded",
  "durationDays",
  "sessionsPerWeek",
  "defaultPricePaise",
] as const;

const EMPTY: PackagePresetInput = {
  name: "",
  kind: "session_pack",
  sessionsIncluded: null,
  durationDays: null,
  sessionsPerWeek: null,
  defaultPricePaise: null,
};

const optionalNumber = { setValueAs: (value: string) => (value === "" ? null : Number(value)) };

export function presetSummary(preset: PackagePresetInput): string {
  const parts = [
    preset.sessionsIncluded ? `${preset.sessionsIncluded} sessions` : null,
    preset.durationDays ? `valid ${preset.durationDays} days` : null,
    preset.sessionsPerWeek ? `${preset.sessionsPerWeek}× a week` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : PACKAGE_KIND_LABELS[preset.kind];
}

function PresetForm({ preset, onDone }: { preset: PackagePreset | null; onDone: () => void }) {
  const router = useRouter();
  const form = useForm<PackagePresetInput>({
    resolver: zodResolver(packagePresetInputSchema),
    defaultValues: preset ?? EMPTY,
  });
  const { register, handleSubmit, formState, setError, control } = form;
  const errors = formState.errors;

  const save = useMutation({
    mutationFn: (body: PackagePresetInput) =>
      preset
        ? unwrap(
            browserApi.PUT("/v1/settings/package-presets/{id}", {
              params: { path: { id: preset.id } },
              body,
            }),
          )
        : unwrap(browserApi.POST("/v1/settings/package-presets", { body })),
    onSuccess: () => {
      toast.success(preset ? "Package updated." : "Package added.");
      router.refresh();
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body.fieldErrors) {
        applyFieldErrors(error, setError, PRESET_FIELDS);
      } else {
        toast.error(error.message);
      }
    },
  });

  return (
    <form
      id="preset-form"
      noValidate
      onSubmit={handleSubmit((body) => save.mutate(body))}
      className="flex flex-col gap-4"
    >
      <Field label="Name" error={errors.name?.message} required>
        <Input maxLength={80} placeholder="e.g. 12 sessions" {...register("name")} />
      </Field>
      <Field label="Type" error={errors.kind?.message} required>
        <Select {...register("kind")}>
          {PACKAGE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {PACKAGE_KIND_LABELS[kind]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Sessions" error={errors.sessionsIncluded?.message}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            {...register("sessionsIncluded", optionalNumber)}
          />
        </Field>
        <Field label="Valid for (days)" error={errors.durationDays?.message}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            {...register("durationDays", optionalNumber)}
          />
        </Field>
        <Field label="Per week" error={errors.sessionsPerWeek?.message}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            {...register("sessionsPerWeek", optionalNumber)}
          />
        </Field>
      </div>
      <Field
        label="Default price (₹)"
        error={errors.defaultPricePaise?.message}
        hint="Optional. Pre-filled when you sell this package; you can change it each time."
      >
        <Controller
          control={control}
          name="defaultPricePaise"
          render={({ field }) => (
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={field.value === null ? "" : String(field.value / 100)}
              onChange={(event) =>
                field.onChange(
                  event.target.value === "" ? null : Math.round(Number(event.target.value) * 100),
                )
              }
              onBlur={field.onBlur}
            />
          )}
        />
      </Field>
    </form>
  );
}

export function PackagePresets({ presets }: { presets: PackagePreset[] }) {
  const router = useRouter();
  const online = useOnline();
  const [editing, setEditing] = useState<PackagePreset | "new" | null>(null);
  const active = presets.filter((preset) => !preset.archived);
  const archived = presets.filter((preset) => preset.archived);

  const toggle = useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      unwrap(
        archive
          ? browserApi.POST("/v1/settings/package-presets/{id}/archive", {
              params: { path: { id } },
            })
          : browserApi.POST("/v1/settings/package-presets/{id}/restore", {
              params: { path: { id } },
            }),
      ),
    onSuccess: (_, { archive }) => {
      toast.success(archive ? "Package archived." : "Package restored.");
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  function row(preset: PackagePreset) {
    return (
      <li key={preset.id} className="flex flex-wrap items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {preset.name}{" "}
            {preset.archived ? <StatusPill tone="neutral">Archived</StatusPill> : null}
          </p>
          <p className="text-sm text-muted-foreground">
            {PACKAGE_KIND_LABELS[preset.kind]} · {presetSummary(preset)} ·{" "}
            {preset.defaultPricePaise === null
              ? "No default price"
              : formatInr(preset.defaultPricePaise)}
          </p>
        </div>
        <div className="flex gap-2">
          {preset.archived ? null : (
            <Button variant="outline" disabled={!online} onClick={() => setEditing(preset)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={!online || toggle.isPending}
            onClick={() => toggle.mutate({ id: preset.id, archive: !preset.archived })}
          >
            {preset.archived ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {preset.archived ? "Restore" : "Archive"}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Package presets</h2>
          <p className="text-sm text-muted-foreground">
            Shapes you sell often. Picking one fills in the package when you sell it.
          </p>
        </div>
        <Button variant="dark" disabled={!online} onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" />
          Add package
        </Button>
      </div>
      {active.length === 0 ? (
        <EmptyState
          title="No packages yet"
          description="Add the packages you sell, like “12 sessions” or “Monthly online coaching”."
        />
      ) : (
        <ul className="divide-y divide-border">{active.map(row)}</ul>
      )}
      {archived.length > 0 ? (
        <details className="pt-2">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Archived ({archived.length})
          </summary>
          <ul className="divide-y divide-border">{archived.map(row)}</ul>
        </details>
      ) : null}
      <Drawer
        open={editing !== null}
        onOpenChange={(open) => (open ? null : setEditing(null))}
        title={editing === "new" ? "Add package" : "Edit package"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="preset-form" disabled={!online}>
              Save package
            </Button>
          </div>
        }
      >
        {editing !== null ? (
          <PresetForm preset={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        ) : null}
      </Drawer>
    </Card>
  );
}
