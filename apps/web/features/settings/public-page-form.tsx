"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  COACHING_MODE_LABELS,
  COACHING_MODES,
  COACHING_TYPES_MAX,
  ENQUIRY_EMAIL_MODES,
  type PublicPageSettingsInput,
  type PublicPageSettingsRequest,
  type PublicPageSettingsResponse,
  publicPageSettingsRequestSchema,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

const FIELDS = [
  "displayName",
  "businessName",
  "slug",
  "headline",
  "bio",
  "location",
  "coachingTypes",
  "coachingModes",
  "form.email",
  "form.schedule",
  "form.message",
  "form.consentText",
] as const;

const EMAIL_MODE_LABELS = {
  hidden: "Don't ask",
  optional: "Optional",
  required: "Required",
} as const;

function defaults(page: PublicPageSettingsResponse): PublicPageSettingsInput {
  return {
    displayName: page.displayName,
    businessName: page.businessName,
    slug: page.slug,
    headline: page.headline,
    bio: page.bio,
    location: page.location,
    coachingTypes: page.coachingTypes,
    coachingModes: page.coachingModes,
    form: {
      email: page.form.email,
      schedule: page.form.schedule,
      message: page.form.message,
      consentText: page.form.consentText,
    },
  };
}

/**
 * Tag-style input for coaching types ("Strength", "Yoga"…): Enter or Add to add, × to remove.
 * `id` and the aria props come from the surrounding Field and go on the text input.
 */
function CoachingTypesInput({
  value,
  onChange,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const full = value.length >= COACHING_TYPES_MAX;

  function add() {
    const type = draft.trim();
    if (!type || full) return;
    if (!value.some((existing) => existing.toLowerCase() === type.toLowerCase())) {
      onChange([...value, type]);
    }
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      add();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Coaching types">
          {value.map((type) => (
            <li
              key={type}
              className="flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-sm"
            >
              {type}
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-full hover:bg-border"
                aria-label={`Remove ${type}`}
                onClick={() => onChange(value.filter((existing) => existing !== type))}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={full ? `Up to ${COACHING_TYPES_MAX} types` : "e.g. Strength, Yoga, Mobility"}
          disabled={full}
          maxLength={40}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        />
        <Button variant="outline" onClick={add} disabled={full || !draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}

export function PublicPageForm({ page }: { page: PublicPageSettingsResponse }) {
  const router = useRouter();
  const online = useOnline();
  const form = useForm<PublicPageSettingsInput, unknown, PublicPageSettingsRequest>({
    resolver: zodResolver(publicPageSettingsRequestSchema),
    defaultValues: defaults(page),
  });
  const { register, handleSubmit, formState, setError, control, reset } = form;
  const errors = formState.errors;
  const modes = useWatch({ control, name: "coachingModes" }) ?? [];
  const slug = useWatch({ control, name: "slug" });
  const bio = useWatch({ control, name: "bio" }) ?? "";

  const save = useMutation({
    mutationFn: (body: PublicPageSettingsRequest) =>
      unwrap(browserApi.PUT("/v1/settings/public-page", { body })),
    onSuccess: (saved) => {
      reset(defaults(saved));
      toast.success(
        saved.form.version > page.form.version
          ? `Saved. Your enquiry form is now version ${saved.form.version}.`
          : "Saved.",
      );
      router.refresh();
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body.fieldErrors) {
        applyFieldErrors(error, setError, FIELDS);
      } else {
        toast.error(error.message);
      }
    },
  });

  return (
    <form
      noValidate
      onSubmit={handleSubmit((body) => save.mutate(body))}
      className="flex flex-col gap-6"
    >
      <Card className="flex flex-col gap-5 p-5">
        <h2 className="font-semibold">About you</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your name" error={errors.displayName?.message} required>
            <Input autoComplete="name" {...register("displayName")} />
          </Field>
          <Field label="Business name" error={errors.businessName?.message} required>
            <Input autoComplete="organization" {...register("businessName")} />
          </Field>
        </div>
        <Field
          label="Headline"
          error={errors.headline?.message}
          hint="One line under your name, e.g. “Strength coaching for busy professionals”. Needed to publish."
        >
          <Input maxLength={120} {...register("headline")} />
        </Field>
        <Field label="Location" error={errors.location?.message} hint="e.g. Koramangala, Bengaluru">
          <Input maxLength={120} {...register("location")} />
        </Field>
        <Field
          label="About your coaching"
          error={errors.bio?.message}
          hint={`${bio.length}/1000 characters`}
        >
          <Textarea rows={5} maxLength={1000} {...register("bio")} />
        </Field>
        <Controller
          control={control}
          name="coachingTypes"
          render={({ field }) => (
            <Field
              label="Coaching types"
              error={errors.coachingTypes?.message ?? errors.coachingTypes?.root?.message}
              hint={`Type one and press Enter or Add. Shown as tags on your page, up to ${COACHING_TYPES_MAX}.`}
            >
              <CoachingTypesInput value={field.value ?? []} onChange={field.onChange} />
            </Field>
          )}
        />
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={errors.coachingModes ? "modes-error" : undefined}
        >
          <legend className="text-sm font-medium">
            How do you coach?{" "}
            <span className="text-danger" aria-hidden="true">
              *
            </span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {COACHING_MODES.map((mode) => (
              <label
                key={mode}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-control border p-3 text-sm font-semibold",
                  modes.includes(mode) ? "border-charcoal bg-muted" : "border-border bg-card",
                )}
              >
                <Checkbox value={mode} {...register("coachingModes")} />
                {COACHING_MODE_LABELS[mode]}
              </label>
            ))}
          </div>
          {errors.coachingModes ? (
            <p id="modes-error" role="alert" className="text-xs font-medium text-danger">
              {errors.coachingModes.message}
            </p>
          ) : null}
        </fieldset>
      </Card>

      <Card className="flex flex-col gap-5 p-5">
        <h2 className="font-semibold">Page address</h2>
        <Field
          label="Address"
          error={errors.slug?.message}
          hint={
            page.isPublished && slug !== page.slug
              ? "Changing the address breaks links and QR codes you've already shared."
              : `Your page is at /coach/${slug || "your-address"}`
          }
          required
        >
          <Input autoCapitalize="none" spellCheck={false} {...register("slug")} />
        </Field>
      </Card>

      <Card className="flex flex-col gap-5 p-5">
        <div>
          <h2 className="font-semibold">Enquiry form</h2>
          <p className="text-sm text-muted-foreground">
            Name, phone, main goal and consent are always asked. Version {page.form.version}:
            changing the fields or consent wording starts a new version, and every enquiry keeps the
            version it agreed to.
          </p>
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Email address</legend>
          <div className="flex flex-wrap gap-2">
            {ENQUIRY_EMAIL_MODES.map((mode) => (
              <label
                key={mode}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-border bg-card px-3 text-sm has-checked:border-charcoal has-checked:bg-muted"
              >
                <input
                  type="radio"
                  value={mode}
                  className="size-4 accent-charcoal"
                  {...register("form.email")}
                />
                {EMAIL_MODE_LABELS[mode]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-3 text-sm">
          <Checkbox {...register("form.schedule")} />
          Ask for preferred days and times
        </label>
        <label className="flex items-center gap-3 text-sm">
          <Checkbox {...register("form.message")} />
          Ask for a message
        </label>
        <Field
          label="Consent wording"
          error={errors.form?.consentText?.message}
          hint="Shown next to the checkbox people tick before sending an enquiry."
          required
        >
          <Textarea rows={4} maxLength={1000} {...register("form.consentText")} />
        </Field>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" loading={save.isPending} disabled={!online || !formState.isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
