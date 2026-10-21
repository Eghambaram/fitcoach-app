"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  COACHING_MODE_LABELS,
  ENQUIRY_MIN_FILL_MS,
  type EnquiryInput,
  type EnquiryRequest,
  enquiryRequestSchema,
  FITNESS_GOAL_LABELS,
  FITNESS_GOALS,
  type PublicLeadSource,
  type PublicPageResponse,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

const FIELDS = [
  "fullName",
  "phone",
  "email",
  "goal",
  "preferredMode",
  "preferredSchedule",
  "message",
  "consent",
] as const;

/** Inlined at build time; without it the form works without the Turnstile challenge. */
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export interface Attribution {
  source: PublicLeadSource | string | undefined;
  utm: EnquiryRequest["utm"];
}

function TurnstileWidget({ onToken }: { onToken: (token: string | undefined) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded || !container.current || !window.turnstile || !TURNSTILE_SITE_KEY) return;
    const id = window.turnstile.render(container.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => onToken(token),
      "expired-callback": () => onToken(undefined),
    });
    return () => window.turnstile?.reset(id);
  }, [loaded, onToken]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setLoaded(true)}
      />
      <div ref={container} />
    </>
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function EnquiryForm({
  page,
  attribution,
}: {
  page: PublicPageResponse;
  attribution: Attribution;
}) {
  const { fields } = page.form;
  const firstName = page.displayName.split(" ")[0] ?? page.displayName;
  const multipleModes = page.coachingModes.length > 1;
  // When the form appeared (set after mount: render must stay pure).
  const mountedAt = useRef<number | null>(null);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const [problem, setProblem] = useState<{ message: string; reload?: boolean } | null>(null);
  const [sentAs, setSentAs] = useState<string | null>(null);

  const form = useForm<EnquiryInput, unknown, EnquiryRequest>({
    resolver: zodResolver(enquiryRequestSchema),
    defaultValues: {
      slug: page.slug,
      fullName: "",
      phone: "",
      email: "",
      goal: undefined,
      preferredMode: undefined,
      preferredSchedule: "",
      message: "",
      source: attribution.source as PublicLeadSource | undefined,
      utm: attribution.utm,
      consent: false as unknown as true,
      consentVersion: page.form.version,
      formToken: page.formToken,
      website: "",
    },
  });
  const { register, handleSubmit, formState, setError, control } = form;
  const errors = formState.errors;
  const chosenMode = useWatch({ control, name: "preferredMode" });

  const send = useMutation({
    mutationFn: async (body: EnquiryRequest) => {
      // The API ignores forms sent back faster than a person types; never let a quick human hit that.
      const remaining =
        ENQUIRY_MIN_FILL_MS + 500 - (Date.now() - (mountedAt.current ?? Date.now()));
      if (remaining > 0) await sleep(remaining);
      return unwrap(browserApi.POST("/v1/public/enquiries", { body: { ...body, turnstileToken } }));
    },
    onSuccess: (_, body) => setSentAs(body.fullName.split(" ")[0] ?? body.fullName),
    onError: (error) => {
      if (!(error instanceof ApiRequestError)) {
        setProblem({ message: "Something went wrong. Please try again." });
        return;
      }
      if (error.code === "FORM_OUTDATED") {
        setProblem({ message: error.message, reload: true });
      } else if (error.body.fieldErrors) {
        const unplaced = applyFieldErrors(error, setError, FIELDS);
        setProblem(unplaced.length > 0 ? { message: error.message } : null);
      } else {
        setProblem({ message: error.message });
      }
    },
  });

  if (sentAs) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-lime">
          <CheckCircle2 className="size-7 text-lime-foreground" aria-hidden="true" />
        </span>
        <h2 className="text-xl font-bold">Thanks, {sentAs}!</h2>
        <p className="max-w-sm text-muted-foreground">
          Your enquiry is with {page.displayName}. {firstName} will get in touch by phone or
          WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit((body) => {
        setProblem(null);
        if (fields.email === "required" && !body.email) {
          setError("email", { message: "Enter your email address" });
          return;
        }
        send.mutate(body);
      })}
      className="relative flex flex-col gap-5"
    >
      {/* Honeypot: hidden from people and assistive tech; bots that fill it are ignored. */}
      <div aria-hidden="true" className="absolute -left-[10000px] size-px overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
        </label>
      </div>

      <Field label="Your name" error={errors.fullName?.message} required>
        <Input autoComplete="name" maxLength={80} {...register("fullName")} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Phone"
          error={errors.phone?.message}
          hint="For a call or WhatsApp. Add the country code if you're outside India."
          required
        >
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={32}
            {...register("phone")}
          />
        </Field>
        {fields.email === "hidden" ? null : (
          <Field
            label={fields.email === "required" ? "Email" : "Email (optional)"}
            error={errors.email?.message}
            required={fields.email === "required"}
          >
            <Input type="email" autoComplete="email" maxLength={254} {...register("email")} />
          </Field>
        )}
      </div>
      <Field label="Your main goal" error={errors.goal?.message} required>
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
      {multipleModes ? (
        <fieldset
          className="flex flex-col gap-2"
          aria-describedby={errors.preferredMode ? "mode-error" : undefined}
        >
          <legend className="text-sm font-medium">How would you like to train? (optional)</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {page.coachingModes.map((mode) => (
              <label
                key={mode}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-control border px-3 text-sm font-semibold",
                  chosenMode === mode ? "border-charcoal bg-muted" : "border-border bg-card",
                )}
              >
                <input
                  type="radio"
                  value={mode}
                  className="size-4 accent-charcoal"
                  {...register("preferredMode")}
                />
                {COACHING_MODE_LABELS[mode]}
              </label>
            ))}
          </div>
          {errors.preferredMode ? (
            <p id="mode-error" role="alert" className="text-xs font-medium text-danger">
              {errors.preferredMode.message}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      {fields.schedule ? (
        <Field label="Preferred days and times" error={errors.preferredSchedule?.message}>
          <Input
            maxLength={200}
            placeholder="e.g. Weekday mornings"
            {...register("preferredSchedule")}
          />
        </Field>
      ) : null}
      {fields.message ? (
        <Field label="Anything else?" error={errors.message?.message}>
          <Textarea
            rows={4}
            maxLength={1000}
            placeholder="Your experience, injuries to know about, questions…"
            {...register("message")}
          />
        </Field>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            className="mt-0.5"
            {...register("consent")}
            aria-invalid={errors.consent ? true : undefined}
          />
          <span>{page.form.consentText}</span>
        </label>
        {errors.consent ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.consent.message}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Your details go only to {page.displayName}. FitCoach stores them on their behalf and never
          sells them or uses them for marketing.
        </p>
      </div>

      {TURNSTILE_SITE_KEY ? <TurnstileWidget onToken={setTurnstileToken} /> : null}

      {problem ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-control bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
        >
          <span className="flex-1">{problem.message}</span>
          {problem.reload ? (
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" size="lg" loading={send.isPending}>
        Send enquiry
      </Button>
    </form>
  );
}
