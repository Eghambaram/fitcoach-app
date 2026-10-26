"use client";

import {
  BASELINE_MEASUREMENTS,
  type BaselineMeasurement,
  COACHING_MODE_LABELS,
  COACHING_MODES,
  type CoachingMode,
  CONSENT_NOTICES,
  EXPERIENCE_LEVEL_LABELS,
  EXPERIENCE_LEVELS,
  type FinalizeOnboardingResponse,
  FITNESS_GOAL_LABELS,
  FITNESS_GOALS,
  initialPackageSchema,
  MEASUREMENT_KINDS,
  MEASUREMENT_LABELS,
  type OnboardingDraft,
  ONBOARDING_STEPS,
  PREFERRED_CONTACT_LABELS,
  PREFERRED_CONTACTS,
} from "@fitcoach/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Stepper } from "@/components/shared/stepper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import {
  initialPackageBody,
  InitialPackageFields,
  type InitialPackageValue,
} from "../packages/initial-package-fields";
import {
  type FieldProblems,
  finalizeBody,
  fromDraftData,
  problemsFor,
  stepOf,
  toDraftData,
  type WizardField,
  type WizardValues,
} from "./wizard-values";

const MODE_DESCRIPTIONS: Record<CoachingMode, string> = {
  in_person: "Meet at a gym or location",
  online: "Remote coaching",
  hybrid: "Both in person and online",
};

const today = () => new Intl.DateTimeFormat("en-CA").format(new Date());

function ChoiceCard({
  checked,
  title,
  detail,
  children,
}: {
  checked: boolean;
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 rounded-control border p-3 text-sm",
        checked ? "border-charcoal bg-muted" : "border-border bg-card hover:bg-muted",
      )}
    >
      {children}
      <span>
        <span className="block font-medium">{title}</span>
        {detail ? <span className="block text-xs text-muted-foreground">{detail}</span> : null}
      </span>
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">
        {value || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

/**
 * Add Client wizard (PROMPT §8.4): Basic info → Goals & training → Baseline & consent → Review &
 * create. "Next" checks the step with the shared schema and saves the draft; "Save as draft" saves
 * whatever is there. Optional fields never block creation.
 */
export function OnboardingWizard({ initial }: { initial: OnboardingDraft }) {
  const pathname = usePathname();
  const online = useOnline();
  const [step, setStep] = useState(Math.min(initial.step, ONBOARDING_STEPS.length));
  const [draftId, setDraftId] = useState(initial.id);
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<FinalizeOnboardingResponse | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  const units = initial.units;
  const [initialPackage, setInitialPackage] = useState<InitialPackageValue>(null);
  const [packageError, setPackageError] = useState<string | undefined>();
  // A converted lead may already have their package (sold while converting).
  const existingPackage = useQuery({
    queryKey: ["client-packages", initial.clientId],
    queryFn: () =>
      unwrap(
        browserApi.GET("/v1/clients/{id}/packages", {
          params: { path: { id: initial.clientId ?? "" } },
        }),
      ),
    enabled: initial.clientId !== null,
    select: (data) => data.active,
  });

  const form = useForm<WizardValues>({ defaultValues: fromDraftData(initial.data) });
  const { register, control, getValues, setError, clearErrors, formState } = form;
  const errors = formState.errors;
  const values = useWatch({ control }) as WizardValues;

  const save = useMutation({
    mutationFn: async (nextStep: number) => {
      const data = toDraftData(getValues());
      return unwrap(
        draftId
          ? browserApi.PUT("/v1/onboarding/drafts/{id}", {
              params: { path: { id: draftId } },
              body: { step: nextStep, data },
            })
          : browserApi.POST("/v1/onboarding/drafts", {
              body: { step: nextStep, data, clientId: initial.clientId ?? undefined },
            }),
      );
    },
    onSuccess: (draft) => {
      if (!draftId && draft.id) {
        setDraftId(draft.id);
        // Refresh-safe and resumable: the URL now points at the saved draft (without a reload).
        window.history.replaceState(null, "", `${pathname}?draft=${draft.id}`);
      }
    },
  });

  const create = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.POST("/v1/onboarding/finalize", {
          params: { header: { "Idempotency-Key": idempotencyKey.current } },
          body: finalizeBody(getValues(), {
            draftId: draftId ?? undefined,
            clientId: initial.clientId ?? undefined,
            units,
            initialPackage: initialPackageBody(initialPackage),
          }),
        }),
      ),
    onSuccess: (result) => {
      setCreated(result);
    },
    onError: (failure) => {
      if (failure instanceof ApiRequestError && failure.body.fieldErrors) {
        const { initialPackage: packageMessages, ...fields } = failure.body.fieldErrors;
        setPackageError(packageMessages?.[0]);
        if (Object.keys(fields).length > 0) {
          showProblems(
            Object.fromEntries(
              Object.entries(fields).map(([field, messages]) => [field, messages[0]]),
            ) as FieldProblems,
          );
        }
      }
      setProblem(failure.message);
    },
  });

  function goTo(next: number) {
    setStep(next);
    setProblem(null);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function showProblems(problems: FieldProblems) {
    clearErrors();
    const fields = Object.keys(problems) as WizardField[];
    for (const field of fields) setError(field, { type: "validate", message: problems[field] });
    const first = fields[0];
    if (first) goTo(Math.min(...fields.map(stepOf)));
  }

  async function next() {
    const problems = problemsFor(getValues(), step as 1 | 2 | 3);
    if (Object.keys(problems).length > 0) {
      showProblems(problems);
      return;
    }
    clearErrors();
    try {
      await save.mutateAsync(step + 1);
    } catch (failure) {
      // Moving on matters more than the draft; say it wasn't saved.
      toast.error(
        failure instanceof Error ? `Draft not saved: ${failure.message}` : "Draft not saved.",
      );
    }
    goTo(step + 1);
  }

  async function saveDraft() {
    try {
      await save.mutateAsync(step);
      toast.success("Draft saved. You can come back to it any time.");
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Draft not saved.");
    }
  }

  function submit() {
    setProblem(null);
    const problems = problemsFor(getValues());
    if (Object.keys(problems).length > 0) {
      showProblems(problems);
      setProblem("Some required details are missing. They're highlighted on the step shown.");
      return;
    }
    const pkg = initialPackageSchema.safeParse(initialPackageBody(initialPackage));
    if (initialPackage && !pkg.success) {
      setPackageError(pkg.error.issues[0]?.message ?? "Check the package");
      setProblem("Check the package price.");
      return;
    }
    setPackageError(undefined);
    create.mutate();
  }

  if (created) {
    const first = created.fullName.split(" ")[0];
    return (
      <Card className="flex max-w-xl flex-col gap-4 p-6">
        <p className="flex items-center gap-2 text-lg font-semibold" role="status">
          <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
          {created.fullName} is now an active client
        </p>
        <p className="text-sm text-muted-foreground">
          Goals and consent are saved
          {created.measurementsRecorded > 0
            ? `, with ${created.measurementsRecorded} baseline measurement${created.measurementsRecorded === 1 ? "" : "s"}`
            : ""}
          .
        </p>
        <div className="flex flex-col gap-1">
          <Button variant="outline" disabled className="self-start">
            <MessageCircle aria-hidden="true" />
            Invite {first} via WhatsApp
          </Button>
          <p className="text-xs text-muted-foreground">
            Client app invites are coming soon. {first} doesn&apos;t need anything from you yet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="dark" asChild>
            <Link href={`/app/clients/${created.clientId}`}>Open profile</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/app/clients/new">Add another client</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/app/leads">Back to leads</Link>
          </Button>
        </div>
      </Card>
    );
  }

  const mode = values.trainingMode;
  const goal = values.primaryGoal;
  const missing = step === 4 ? problemsFor(getValues()) : {};
  const unitOf = (key: BaselineMeasurement) =>
    MEASUREMENT_KINDS[key] === "mass"
      ? units.weightUnit
      : MEASUREMENT_KINDS[key] === "length"
        ? units.lengthUnit
        : "%";

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Stepper steps={ONBOARDING_STEPS} current={step - 1} />
      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
            {ONBOARDING_STEPS[step - 1]}
          </h2>
          <p className="text-sm text-muted-foreground">
            {
              [
                "Start with the essentials.",
                "Tell us about your client's goals and training preferences.",
                "Record initial measurements (optional) and consent.",
                "Check the details, then create the client.",
              ][step - 1]
            }
          </p>
        </div>

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <Field label="Full name" error={errors.fullName?.message} required>
              <Input autoComplete="off" maxLength={80} {...register("fullName")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Phone number"
                error={errors.phone?.message}
                hint="Without a country code, your workspace country is used."
              >
                <Input type="tel" inputMode="tel" maxLength={32} {...register("phone")} />
              </Field>
              <Field label="Email (optional)" error={errors.email?.message}>
                <Input type="email" maxLength={254} {...register("email")} />
              </Field>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Preferred contact method</legend>
              <div className="flex flex-wrap gap-2">
                {PREFERRED_CONTACTS.map((contact) => (
                  <label
                    key={contact}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium",
                      values.preferredContact === contact
                        ? "border-charcoal bg-lime text-lime-foreground"
                        : "border-border bg-card",
                    )}
                  >
                    <input
                      type="radio"
                      value={contact}
                      className="size-4 accent-charcoal"
                      {...register("preferredContact")}
                    />
                    {PREFERRED_CONTACT_LABELS[contact]}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field
              label="Date of birth (optional)"
              error={errors.dob?.message}
              className="sm:max-w-60"
            >
              <Input type="date" max={today()} {...register("dob")} />
            </Field>
            <fieldset className="flex flex-col gap-3 rounded-control border border-border p-3">
              <legend className="px-1 text-sm font-medium">Emergency contact (optional)</legend>
              <p className="text-xs text-muted-foreground">Only you can see this.</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Name" error={errors.emergencyContactName?.message}>
                  <Input maxLength={80} {...register("emergencyContactName")} />
                </Field>
                <Field label="Phone" error={errors.emergencyContactPhone?.message}>
                  <Input
                    type="tel"
                    inputMode="tel"
                    maxLength={32}
                    {...register("emergencyContactPhone")}
                  />
                </Field>
                <Field label="Relationship" error={errors.emergencyContactRelation?.message}>
                  <Input maxLength={40} {...register("emergencyContactRelation")} />
                </Field>
              </div>
            </fieldset>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                Training mode{" "}
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {COACHING_MODES.map((option) => (
                  <ChoiceCard
                    key={option}
                    checked={mode === option}
                    title={COACHING_MODE_LABELS[option]}
                    detail={MODE_DESCRIPTIONS[option]}
                  >
                    <input
                      type="radio"
                      value={option}
                      className="mt-0.5 size-4 accent-charcoal"
                      {...register("trainingMode")}
                    />
                  </ChoiceCard>
                ))}
              </div>
              {errors.trainingMode?.message ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {errors.trainingMode.message}
                </p>
              ) : null}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                Primary fitness goal{" "}
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {FITNESS_GOALS.map((option) => (
                  <ChoiceCard
                    key={option}
                    checked={goal === option}
                    title={FITNESS_GOAL_LABELS[option]}
                  >
                    <input
                      type="radio"
                      value={option}
                      className="mt-0.5 size-4 accent-charcoal"
                      {...register("primaryGoal")}
                    />
                  </ChoiceCard>
                ))}
              </div>
              {errors.primaryGoal?.message ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {errors.primaryGoal.message}
                </p>
              ) : null}
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Other goals (optional)</legend>
              <div className="flex flex-wrap gap-x-4">
                {FITNESS_GOALS.filter((option) => option !== goal).map((option) => (
                  <label key={option} className="flex min-h-11 items-center gap-2 text-sm">
                    <Checkbox value={option} {...register("secondaryGoals")} />
                    {FITNESS_GOAL_LABELS[option]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Location or online preference" error={errors.location?.message}>
                <Input
                  maxLength={120}
                  placeholder="e.g. FitLife Gym, or video calls"
                  {...register("location")}
                />
              </Field>
              <Field label="Preferred days and times" error={errors.preferredSchedule?.message}>
                <Input
                  maxLength={200}
                  placeholder="e.g. Mon/Wed/Fri mornings"
                  {...register("preferredSchedule")}
                />
              </Field>
              <Field label="Experience" error={errors.experience?.message}>
                <Select {...register("experience")}>
                  <option value="">Not sure yet</option>
                  {EXPERIENCE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {EXPERIENCE_LEVEL_LABELS[level]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Start date" error={errors.coachingStartOn?.message}>
                <Input type="date" {...register("coachingStartOn")} />
              </Field>
            </div>
            <Field label="Equipment available" error={errors.equipment?.message}>
              <Input
                maxLength={200}
                placeholder="e.g. Dumbbells at home, full gym"
                {...register("equipment")}
              />
            </Field>
            <Field label="Program (optional)" hint="Available after programs are set up.">
              <Select disabled defaultValue="">
                <option value="">No program yet</option>
              </Select>
            </Field>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="flex flex-col gap-5">
            <Field
              label="Measurement date"
              error={errors.measuredOn?.message}
              className="sm:max-w-60"
            >
              <Input type="date" max={today()} {...register("measuredOn")} />
            </Field>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {BASELINE_MEASUREMENTS.map((key) => (
                <Field
                  key={key}
                  label={`${MEASUREMENT_LABELS[key].replace(" %", "")} (${unitOf(key)})`}
                  error={errors[key]?.message}
                >
                  <Input type="text" inputMode="decimal" autoComplete="off" {...register(key)} />
                </Field>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              All measurements are optional. They become the starting point on the client&apos;s
              progress charts.
            </p>
            <Field
              label="Training limitations or notes"
              error={errors.limitations?.message}
              hint="Injuries, conditions, things to avoid. Only you can see this."
            >
              <Textarea
                rows={3}
                maxLength={1000}
                placeholder="e.g. Previous knee injury, no jumping"
                {...register("limitations")}
              />
            </Field>
            <div className="flex flex-col gap-3 rounded-control border border-border p-3">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox className="mt-0.5" {...register("consentDataProcessing")} />
                <span>
                  {CONSENT_NOTICES.data_processing.text}
                  <span className="text-danger" aria-hidden="true">
                    {" "}
                    *
                  </span>
                </span>
              </label>
              {errors.consentDataProcessing?.message ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {errors.consentDataProcessing.message}
                </p>
              ) : null}
              <label className="flex items-start gap-3 text-sm">
                <Checkbox className="mt-0.5" {...register("consentProgressPhotos")} />
                <span>
                  {CONSENT_NOTICES.progress_photos.text}{" "}
                  <span className="text-muted-foreground">(optional, separate)</span>
                </span>
              </label>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-col gap-5">
            {Object.keys(missing).length > 0 ? (
              <div role="alert" className="rounded-control bg-warning-soft p-3 text-sm">
                <p className="font-semibold text-warning">
                  Still needed before you can create the client
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {(Object.entries(missing) as [WizardField, string][]).map(([field, message]) => (
                    <li key={field}>
                      <button
                        type="button"
                        className="min-h-9 text-left underline"
                        onClick={() => showProblems({ [field]: message })}
                      >
                        {message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <dl className="divide-y divide-border">
              <ReviewRow label="Name" value={values.fullName} />
              <ReviewRow label="Phone" value={values.phone} />
              <ReviewRow label="Email" value={values.email} />
              <ReviewRow
                label="Contact by"
                value={
                  values.preferredContact ? PREFERRED_CONTACT_LABELS[values.preferredContact] : ""
                }
              />
              <ReviewRow label="Primary goal" value={goal ? FITNESS_GOAL_LABELS[goal] : ""} />
              <ReviewRow
                label="Other goals"
                value={(values.secondaryGoals ?? [])
                  .map((item) => FITNESS_GOAL_LABELS[item])
                  .join(", ")}
              />
              <ReviewRow label="Training mode" value={mode ? COACHING_MODE_LABELS[mode] : ""} />
              <ReviewRow label="Schedule" value={values.preferredSchedule} />
              <ReviewRow label="Start date" value={values.coachingStartOn} />
              <ReviewRow
                label="Baseline"
                value={BASELINE_MEASUREMENTS.filter((key) => values[key])
                  .map((key) => `${MEASUREMENT_LABELS[key]} ${values[key]} ${unitOf(key)}`)
                  .join(" · ")}
              />
              <ReviewRow
                label="Consent"
                value={
                  values.consentDataProcessing
                    ? `Data processing given${values.consentProgressPhotos ? "; progress photos given" : "; no progress photos"}`
                    : ""
                }
              />
            </dl>
            <div className="grid gap-4 sm:grid-cols-2">
              {existingPackage.data ? (
                <div className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium">Package</span>
                  <p>
                    {existingPackage.data.name}{" "}
                    <span className="text-muted-foreground">(sold when converting the lead)</span>
                  </p>
                </div>
              ) : (
                <InitialPackageFields
                  value={initialPackage}
                  onChange={(next) => {
                    setInitialPackage(next);
                    setPackageError(undefined);
                  }}
                  error={packageError}
                />
              )}
              <Field label="Program (optional)" hint="Available after programs are set up.">
                <Select disabled defaultValue="">
                  <option value="">No program yet</option>
                </Select>
              </Field>
            </div>
          </div>
        ) : null}

        {problem ? (
          <p role="alert" className="text-sm font-medium text-danger">
            {problem}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => goTo(step - 1)}>
              Back
            </Button>
          ) : null}
          <Button
            variant="outline"
            className="sm:ml-auto"
            loading={save.isPending && !create.isPending}
            disabled={!online}
            onClick={saveDraft}
          >
            Save as draft
          </Button>
          {step < ONBOARDING_STEPS.length ? (
            <Button variant="dark" disabled={!online} loading={save.isPending} onClick={next}>
              Next
            </Button>
          ) : (
            <Button
              disabled={!online || create.isSuccess}
              loading={create.isPending}
              onClick={submit}
            >
              Create client
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
