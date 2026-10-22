"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  COACHING_MODE_LABELS,
  COACHING_MODES,
  type CreateLeadInput,
  type CreateLeadRequest,
  createLeadRequestSchema,
  type DuplicateCheckResponse,
  FITNESS_GOAL_LABELS,
  FITNESS_GOALS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  type LeadDetailResponse,
  updateLeadRequestSchema,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { StagePill } from "./lead-display";

const FIELDS = [
  "fullName",
  "phone",
  "email",
  "goal",
  "source",
  "trainingMode",
  "preferredSchedule",
  "location",
  "interestedService",
  "referrer",
  "campaign",
  "note",
] as const;

/** Edit starts from the stored lead; the phone is shown as stored (E.164). */
function fromLead(lead: LeadDetailResponse): CreateLeadInput {
  return {
    fullName: lead.fullName,
    phone: lead.phoneE164 ?? "",
    email: lead.email ?? "",
    goal: lead.goal,
    source: lead.source,
    trainingMode: lead.trainingMode,
    preferredSchedule: lead.preferredSchedule ?? "",
    location: lead.location ?? "",
    interestedService: lead.interestedService ?? "",
    referrer: lead.referrer ?? "",
    campaign: lead.campaign ?? "",
  };
}

const EMPTY: CreateLeadInput = {
  fullName: "",
  phone: "",
  email: "",
  goal: undefined as unknown as CreateLeadInput["goal"],
  source: undefined as unknown as CreateLeadInput["source"],
  trainingMode: null,
  preferredSchedule: "",
  location: "",
  interestedService: "",
  referrer: "",
  campaign: "",
  note: "",
};

/**
 * Add Lead and Edit share this form (PROMPT §8.2). Duplicate detection is a non-blocking
 * "Possible match" panel: open the existing lead, or carry on.
 */
export function LeadForm({
  lead,
  onSaved,
  onOpenLead,
}: {
  /** Present when editing. */
  lead?: LeadDetailResponse;
  onSaved: (saved: LeadDetailResponse) => void;
  onOpenLead: (id: string) => void;
}) {
  const editing = lead !== undefined;
  const online = useOnline();
  const [matches, setMatches] = useState<DuplicateCheckResponse["matches"]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const form = useForm<CreateLeadInput, unknown, CreateLeadRequest>({
    resolver: zodResolver(editing ? updateLeadRequestSchema : createLeadRequestSchema),
    defaultValues: lead ? fromLead(lead) : EMPTY,
  });
  const { register, handleSubmit, formState, setError, control, getValues } = form;
  const errors = formState.errors;
  const mode = useWatch({ control, name: "trainingMode" });

  const check = useMutation({
    mutationFn: () => {
      const { phone, email } = getValues();
      return unwrap(
        browserApi.POST("/v1/leads/duplicates", {
          body: { phone: phone || undefined, email: email || undefined, excludeLeadId: lead?.id },
        }),
      );
    },
    onSuccess: (result) => setMatches(result.matches),
  });

  const save = useMutation({
    mutationFn: (body: CreateLeadRequest) =>
      lead
        ? unwrap(browserApi.PATCH("/v1/leads/{id}", { params: { path: { id: lead.id } }, body }))
        : unwrap(browserApi.POST("/v1/leads", { body })),
    onSuccess: onSaved,
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body.fieldErrors) {
        const unplaced = applyFieldErrors(error, setError, FIELDS);
        setProblem(unplaced.length > 0 ? error.message : null);
      } else {
        setProblem(error.message);
      }
    },
  });

  function checkDuplicates() {
    const { phone, email } = getValues();
    if (phone || email) check.mutate();
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit((body) => {
        setProblem(null);
        save.mutate(body);
      })}
      className="flex flex-col gap-4"
    >
      <Field label="Full name" error={errors.fullName?.message} required>
        <Input autoComplete="off" maxLength={80} {...register("fullName")} />
      </Field>
      <Field
        label="Phone"
        error={errors.phone?.message}
        hint="A phone or an email is required. Numbers without a country code use your workspace country."
      >
        <Input
          type="tel"
          inputMode="tel"
          maxLength={32}
          {...register("phone", { onBlur: checkDuplicates })}
        />
      </Field>
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" maxLength={254} {...register("email", { onBlur: checkDuplicates })} />
      </Field>

      {matches.length > 0 ? (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-control bg-warning-soft p-3 text-sm"
        >
          <p className="flex items-center gap-2 font-semibold text-warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Possible match
          </p>
          <ul className="flex flex-col gap-2">
            {matches.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{match.fullName}</span>
                <StagePill stage={match.stage} />
                <span className="text-xs text-muted-foreground">
                  same {match.matchedOn.join(" and ")}
                </span>
                <button
                  type="button"
                  className="ml-auto min-h-9 rounded-control px-2 font-semibold underline"
                  onClick={() => onOpenLead(match.id)}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="self-start text-xs font-semibold underline"
            onClick={() => setMatches([])}
          >
            {editing ? "Keep both" : "Create anyway"}
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Main goal" error={errors.goal?.message} required>
          <Select defaultValue="" {...register("goal")}>
            <option value="" disabled>
              Choose one
            </option>
            {FITNESS_GOALS.map((goal) => (
              <option key={goal} value={goal}>
                {FITNESS_GOAL_LABELS[goal]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="How did they hear about you?" error={errors.source?.message} required>
          <Select defaultValue="" {...register("source")}>
            <option value="" disabled>
              Choose one
            </option>
            {LEAD_SOURCES.map((source) => (
              <option key={source} value={source}>
                {LEAD_SOURCE_LABELS[source]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Training mode</legend>
        <div className="grid grid-cols-3 gap-2">
          {COACHING_MODES.map((option) => (
            <label
              key={option}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-3 text-sm font-medium",
                mode === option ? "border-charcoal bg-muted" : "border-border bg-card",
              )}
            >
              <input
                type="radio"
                value={option}
                className="size-4 accent-charcoal"
                {...register("trainingMode")}
              />
              {COACHING_MODE_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preferred schedule" error={errors.preferredSchedule?.message}>
          <Input maxLength={200} placeholder="e.g. Evenings" {...register("preferredSchedule")} />
        </Field>
        <Field label="Location" error={errors.location?.message}>
          <Input maxLength={120} {...register("location")} />
        </Field>
        <Field label="Interested in" error={errors.interestedService?.message}>
          <Input
            maxLength={120}
            placeholder="e.g. 12-session pack"
            {...register("interestedService")}
          />
        </Field>
        <Field label="Referred by" error={errors.referrer?.message}>
          <Input maxLength={120} {...register("referrer")} />
        </Field>
        <Field label="Campaign" error={errors.campaign?.message}>
          <Input maxLength={100} {...register("campaign")} />
        </Field>
      </div>

      {editing ? null : (
        <Field label="Note" error={errors.note?.message} hint="Private — only you can see notes.">
          <Textarea rows={3} maxLength={2000} {...register("note")} />
        </Field>
      )}

      {problem ? (
        <p
          role="alert"
          className="rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
        >
          {problem}
        </p>
      ) : null}
      <Button type="submit" size="lg" loading={save.isPending} disabled={!online}>
        {editing ? "Save changes" : "Create lead"}
      </Button>
    </form>
  );
}
