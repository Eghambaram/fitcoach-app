"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ClientProfileResponse,
  FITNESS_GOAL_LABELS,
  LENGTH_UNITS,
  PREFERRED_CONTACT_LABELS,
  PREFERRED_CONTACTS,
  type UpdateClientPreferencesRequest,
  updateClientPreferencesRequestSchema,
  WEIGHT_UNITS,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { dayLabel } from "../calendar/dates";
import { packageLine } from "./client-display";

/** Profile (PROMPT §9): details and goals read-only; contact preference and units editable. */
export function ClientProfile({
  initial,
  today,
}: {
  initial: ClientProfileResponse;
  today: string;
}) {
  const online = useOnline();
  const [profile, setProfile] = useState(initial);
  const form = useForm<UpdateClientPreferencesRequest>({
    resolver: zodResolver(updateClientPreferencesRequestSchema),
    defaultValues: {
      preferredContact: initial.preferredContact,
      weightUnit: initial.units.weightUnit,
      lengthUnit: initial.units.lengthUnit,
    },
  });
  const save = useMutation({
    mutationFn: (body: UpdateClientPreferencesRequest) =>
      unwrap(browserApi.PUT("/v1/client/profile/preferences", { body })),
    onSuccess: (next) => {
      setProfile(next);
      form.reset({
        preferredContact: next.preferredContact,
        weightUnit: next.units.weightUnit,
        lengthUnit: next.units.lengthUnit,
      });
      toast.success("Settings saved.");
    },
    onError: (failure) => {
      if (failure instanceof ApiRequestError && failure.body.fieldErrors) {
        applyFieldErrors(failure, form.setError, ["preferredContact", "weightUnit", "lengthUnit"]);
      } else {
        toast.error(failure.message);
      }
    },
  });

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      <Card className="flex flex-col gap-1 p-5 text-sm">
        <p className="text-lg font-semibold">{profile.fullName}</p>
        {profile.email ? <p className="text-muted-foreground">{profile.email}</p> : null}
        {profile.phoneE164 ? <p className="text-muted-foreground">{profile.phoneE164}</p> : null}
        <p className="mt-2 text-xs text-muted-foreground">To change these, ask your trainer.</p>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Target className="size-5" aria-hidden="true" />
          My goals
        </h2>
        {profile.goals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No goals set yet.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {profile.goals.map((goal) => (
              <li key={`${goal.goal}-${goal.primary}`}>
                <span className="font-medium">{FITNESS_GOAL_LABELS[goal.goal]}</span>
                {goal.primary ? " (main goal)" : ""}
                {goal.targetText ? ` · ${goal.targetText}` : ""}
                {goal.targetDate ? ` · by ${dayLabel(goal.targetDate)}` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">Goals are set with your trainer.</p>
      </Card>

      <Card className="flex flex-col gap-1 p-5 text-sm">
        <h2 className="font-semibold">My package</h2>
        <p className="text-muted-foreground">
          {profile.package
            ? `${profile.package.name}: ${packageLine(profile.package, today)}`
            : "No active package."}
        </p>
      </Card>

      <Card className="p-5">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <h2 className="font-semibold">Settings</h2>
          <Field
            label="How should your trainer contact you?"
            error={form.formState.errors.preferredContact?.message}
          >
            <Select
              {...form.register("preferredContact", {
                setValueAs: (value: string) => (value === "" ? null : value),
              })}
            >
              <option value="">No preference</option>
              {PREFERRED_CONTACTS.map((value) => (
                <option key={value} value={value}>
                  {PREFERRED_CONTACT_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight" error={form.formState.errors.weightUnit?.message}>
              <Select {...form.register("weightUnit")}>
                {WEIGHT_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Length" error={form.formState.errors.lengthUnit?.message}>
              <Select {...form.register("lengthUnit")}>
                {LENGTH_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button
            type="submit"
            className="self-start"
            loading={save.isPending}
            disabled={!online || !form.formState.isDirty}
          >
            Save settings
          </Button>
        </form>
      </Card>
    </div>
  );
}
