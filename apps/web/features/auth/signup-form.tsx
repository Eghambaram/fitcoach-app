"use client";

import { PrivacyLink, TermsLink } from "@/components/shared/legal-links";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  COACHING_MODES,
  type CoachingMode,
  DEFAULT_TIMEZONE,
  signupRequestSchema,
  slugify,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type FieldPath, useForm } from "react-hook-form";
import type { z } from "zod";
import { useOnline } from "@/components/shared/offline-banner";
import { Stepper } from "@/components/shared/stepper";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { useTimeZones } from "@/lib/time-zones";
import { cn } from "@/lib/utils";
import { FormAlert } from "./auth-layout";
import { PasswordInput } from "./password-input";

type SignupInput = z.input<typeof signupRequestSchema>;
type SignupOutput = z.output<typeof signupRequestSchema>;

export const SIGNUP_STEPS = ["Account", "Profile", "Business"] as const;

/** Fields validated before leaving each step, in form order. */
const STEP_FIELDS: readonly (readonly FieldPath<SignupInput>[])[] = [
  ["account.email", "account.password"],
  ["profile.displayName", "profile.phone"],
  [
    "business.businessName",
    "business.slug",
    "business.city",
    "business.coachingModes",
    "business.timezone",
    "inviteCode",
    "acceptTerms",
  ],
];
const ALL_FIELDS = STEP_FIELDS.flat();

/** Which step shows an API field error (e.g. "business.slug" → step 3). */
export function stepForField(path: string): number {
  const index = STEP_FIELDS.findIndex((fields) =>
    fields.some((field) => path === field || path.startsWith(`${field}.`)),
  );
  return index === -1 ? STEP_FIELDS.length - 1 : index;
}

const MODE_LABELS: Record<CoachingMode, { label: string; description: string }> = {
  in_person: { label: "In-person", description: "Gym, studio or home" },
  online: { label: "Online", description: "Video calls and remote coaching" },
  hybrid: { label: "Hybrid", description: "A mix of both" },
};

export function SignupForm({ inviteRequired }: { inviteRequired: boolean }) {
  const router = useRouter();
  const online = useOnline();
  const timeZones = useTimeZones();
  const [step, setStep] = useState(0);
  const [slugEdited, setSlugEdited] = useState(false);

  const form = useForm<SignupInput, unknown, SignupOutput>({
    resolver: zodResolver(signupRequestSchema),
    mode: "onTouched",
    defaultValues: {
      account: { email: "", password: "" },
      profile: { displayName: "", phone: "" },
      business: {
        businessName: "",
        slug: "",
        city: "",
        coachingModes: [],
        timezone: DEFAULT_TIMEZONE,
      },
      inviteCode: "",
      acceptTerms: false as unknown as true,
    },
  });
  const { register, formState, setValue, watch, trigger, setError } = form;
  const errors = formState.errors;

  // Suggest the page address from the business name until the trainer edits it.
  const businessName = watch("business.businessName");
  useEffect(() => {
    if (!slugEdited)
      setValue("business.slug", slugify(businessName ?? ""), { shouldValidate: false });
  }, [businessName, slugEdited, setValue]);

  const signup = useMutation({
    mutationFn: (body: SignupOutput) =>
      unwrap(
        browserApi.POST("/v1/auth/signup", {
          body: {
            ...body,
            profile: { ...body.profile, phone: body.profile.phone || undefined },
            inviteCode: body.inviteCode || undefined,
          },
        }),
      ),
    onSuccess: () => router.push("/verify-email?sent=1"),
    onError: (error) => {
      if (!(error instanceof ApiRequestError) || !error.body.fieldErrors) return;
      applyFieldErrors(error, setError, ALL_FIELDS);
      const steps = Object.keys(error.body.fieldErrors).map(stepForField);
      if (steps.length > 0) setStep(Math.min(...steps));
    },
  });

  async function next() {
    if (await trigger(STEP_FIELDS[step] as FieldPath<SignupInput>[], { shouldFocus: true }))
      setStep(step + 1);
  }

  const apiError =
    signup.error instanceof ApiRequestError && !signup.error.body.fieldErrors ? signup.error : null;
  const modes = watch("business.coachingModes") ?? [];

  return (
    <div className="flex flex-col gap-8">
      <Stepper steps={SIGNUP_STEPS} current={step} />
      <form
        noValidate
        onSubmit={form.handleSubmit(
          (values) => signup.mutate(values),
          // An error on an earlier, hidden step: go back to it.
          (invalid) => setStep(Math.min(...Object.keys(invalid).map(stepForField), step)),
        )}
        className="flex flex-col gap-5"
        aria-label={`Sign up — step ${step + 1} of ${SIGNUP_STEPS.length}: ${SIGNUP_STEPS[step]}`}
      >
        {apiError ? <FormAlert>{apiError.message}</FormAlert> : null}

        {/* Hidden steps stay registered (inert, not disabled): React Hook Form drops disabled fields. */}
        <fieldset className={cn("flex flex-col gap-5", step !== 0 && "hidden")} inert={step !== 0}>
          <legend className="sr-only">Account</legend>
          <Field label="Email" error={errors.account?.email?.message} required>
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              {...register("account.email")}
            />
          </Field>
          <Field
            label="Password"
            error={errors.account?.password?.message}
            hint="At least 10 characters. A short phrase works well."
            required
          >
            <PasswordInput autoComplete="new-password" {...register("account.password")} />
          </Field>
        </fieldset>

        <fieldset className={cn("flex flex-col gap-5", step !== 1 && "hidden")} inert={step !== 1}>
          <legend className="sr-only">Profile</legend>
          <Field label="Your name" error={errors.profile?.displayName?.message} required>
            <Input autoComplete="name" {...register("profile.displayName")} />
          </Field>
          <Field
            label="Phone (optional)"
            error={errors.profile?.phone?.message}
            hint="For your clients to reach you on WhatsApp. Indian numbers can skip +91."
          >
            <Input type="tel" autoComplete="tel" inputMode="tel" {...register("profile.phone")} />
          </Field>
        </fieldset>

        <fieldset className={cn("flex flex-col gap-5", step !== 2 && "hidden")} inert={step !== 2}>
          <legend className="sr-only">Business</legend>
          <Field label="Business name" error={errors.business?.businessName?.message} required>
            <Input autoComplete="organization" {...register("business.businessName")} />
          </Field>
          <Field
            label="Your page address"
            error={errors.business?.slug?.message}
            hint="Clients find your enquiry page at /coach/your-address. You can change it later."
            required
          >
            <Input
              autoCapitalize="none"
              spellCheck={false}
              {...register("business.slug", { onChange: () => setSlugEdited(true) })}
            />
          </Field>
          <Field label="City (optional)" error={errors.business?.city?.message}>
            <Input autoComplete="address-level2" {...register("business.city")} />
          </Field>

          <fieldset
            className="flex flex-col gap-2"
            aria-describedby={errors.business?.coachingModes ? "modes-error" : undefined}
          >
            <legend className="text-sm font-medium">
              How do you coach?{" "}
              <span className="text-danger" aria-hidden="true">
                *
              </span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {COACHING_MODES.map((mode) => {
                const checked = modes.includes(mode);
                return (
                  <label
                    key={mode}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-control border p-3 text-sm",
                      checked ? "border-charcoal bg-muted" : "border-border bg-card",
                    )}
                  >
                    <Checkbox
                      value={mode}
                      {...register("business.coachingModes")}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block font-semibold">{MODE_LABELS[mode].label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {MODE_LABELS[mode].description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.business?.coachingModes ? (
              <p id="modes-error" role="alert" className="text-xs font-medium text-danger">
                {errors.business.coachingModes.message}
              </p>
            ) : null}
          </fieldset>

          <Field
            label="Time zone"
            error={errors.business?.timezone?.message}
            hint="Used for today's schedule and reminders."
          >
            <Select {...register("business.timezone")}>
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={inviteRequired ? "Beta invite code" : "Beta invite code (optional)"}
            error={errors.inviteCode?.message}
            hint="FitCoach is in a closed beta. Enter the code you were given, e.g. FIT-7KQ2-M9XD."
            required={inviteRequired}
          >
            <Input autoCapitalize="characters" spellCheck={false} {...register("inviteCode")} />
          </Field>

          <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-3 text-sm">
              <Checkbox
                {...register("acceptTerms")}
                aria-invalid={errors.acceptTerms ? true : undefined}
              />
              <span>
                I accept the FitCoach <TermsLink /> and <PrivacyLink />, and confirm I'll get my
                clients' consent before adding their details.
              </span>
            </label>
            {errors.acceptTerms ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {errors.acceptTerms.message}
              </p>
            ) : null}
          </div>
        </fieldset>

        <div className="flex gap-3 pt-2">
          {step > 0 ? (
            <Button
              variant="outline"
              size="lg"
              onClick={() => setStep(step - 1)}
              className="flex-1"
            >
              Back
            </Button>
          ) : null}
          {step < SIGNUP_STEPS.length - 1 ? (
            <Button variant="dark" size="lg" onClick={next} className="flex-1">
              Continue
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              loading={signup.isPending}
              disabled={!online}
              className="flex-1"
            >
              Create account
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
