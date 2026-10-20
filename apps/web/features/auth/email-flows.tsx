"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type EmailOnlyRequest, emailOnlyRequestSchema, passwordSchema } from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { FormAlert } from "./auth-layout";
import { PasswordInput } from "./password-input";

function EmailForm({
  submitLabel,
  onSubmit,
  pending,
}: {
  submitLabel: string;
  onSubmit: (values: EmailOnlyRequest) => void;
  pending: boolean;
}) {
  const online = useOnline();
  const form = useForm<EmailOnlyRequest>({
    resolver: zodResolver(emailOnlyRequestSchema),
    defaultValues: { email: "" },
  });
  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <Field label="Email" error={form.formState.errors.email?.message} required>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </Field>
      <Button type="submit" size="lg" loading={pending} disabled={!online}>
        {submitLabel}
      </Button>
    </form>
  );
}

/** Same answer whether or not the email has an account (non-enumerating, PROMPT §12.2). */
export function ForgotPasswordForm() {
  const request = useMutation({
    mutationFn: (body: EmailOnlyRequest) =>
      unwrap(browserApi.POST("/v1/auth/password/forgot", { body })),
  });
  if (request.isSuccess) {
    return (
      <FormAlert tone="success">
        If there's an account for that email, we've sent a link to reset the password. It works once
        and expires in 1 hour.
      </FormAlert>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {request.error ? <FormAlert>{request.error.message}</FormAlert> : null}
      <EmailForm
        submitLabel="Send reset link"
        pending={request.isPending}
        onSubmit={(values) => request.mutate(values)}
      />
    </div>
  );
}

export function ResendVerificationForm() {
  const resend = useMutation({
    mutationFn: (body: EmailOnlyRequest) =>
      unwrap(browserApi.POST("/v1/auth/verify-email/resend", { body })),
  });
  if (resend.isSuccess) {
    return (
      <FormAlert tone="success">
        If that address is waiting for confirmation, a new link is on its way.
      </FormAlert>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {resend.error ? <FormAlert>{resend.error.message}</FormAlert> : null}
      <EmailForm
        submitLabel="Send a new link"
        pending={resend.isPending}
        onSubmit={(values) => resend.mutate(values)}
      />
    </div>
  );
}

/**
 * Confirming takes a click rather than happening on page load: email scanners open links
 * automatically and would otherwise use up the single-use token.
 */
export function ConfirmEmail({ token }: { token: string }) {
  const confirm = useMutation({
    mutationFn: () => unwrap(browserApi.POST("/v1/auth/verify-email", { body: { token } })),
  });

  if (confirm.isSuccess) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">Your email is confirmed. You can log in now.</FormAlert>
        <Button asChild size="lg">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
      {confirm.error ? <FormAlert>{confirm.error.message}</FormAlert> : null}
      {confirm.error ? (
        <ResendVerificationForm />
      ) : (
        <Button size="lg" loading={confirm.isPending} onClick={() => confirm.mutate()}>
          <MailCheck aria-hidden="true" />
          Confirm my email
        </Button>
      )}
    </div>
  );
}

const resetFormSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match",
  });
type ResetFormValues = z.infer<typeof resetFormSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const online = useOnline();
  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetFormSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });
  const reset = useMutation({
    mutationFn: (password: string) =>
      unwrap(browserApi.POST("/v1/auth/password/reset", { body: { token, password } })),
  });

  if (reset.isSuccess) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">
          Your password is changed and you've been signed out everywhere. Log in with the new one.
        </FormAlert>
        <Button asChild size="lg">
          <Link href="/login">Log in</Link>
        </Button>
      </div>
    );
  }
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => reset.mutate(values.password))}
      className="flex flex-col gap-5"
    >
      {reset.error ? (
        <FormAlert>
          {reset.error.message}{" "}
          <Link href="/forgot-password" className="underline underline-offset-2">
            Request a new link
          </Link>
        </FormAlert>
      ) : null}
      <Field
        label="New password"
        error={form.formState.errors.password?.message}
        hint="At least 10 characters."
        required
      >
        <PasswordInput autoComplete="new-password" {...form.register("password")} />
      </Field>
      <Field
        label="Confirm new password"
        error={form.formState.errors.confirmPassword?.message}
        required
      >
        <PasswordInput autoComplete="new-password" {...form.register("confirmPassword")} />
      </Field>
      <Button type="submit" size="lg" loading={reset.isPending} disabled={!online}>
        Change password
      </Button>
    </form>
  );
}
