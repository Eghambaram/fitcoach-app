"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CLIENT_OTP_LENGTH,
  CLIENT_OTP_TTL_MINUTES,
  type RequestCodeRequest,
  requestCodeRequestSchema,
  type VerifyCodeRequest,
  verifyCodeRequestSchema,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { FormAlert } from "../auth/auth-layout";

/**
 * `/client/login` (PROMPT §9, §12.2): a 6-digit code by email. The first step never says whether
 * the email has access; the code expires in 10 minutes and allows 5 tries.
 */
export function ClientLogin() {
  const router = useRouter();
  const online = useOnline();
  const [email, setEmail] = useState<string | null>(null);
  const emailForm = useForm<RequestCodeRequest>({
    resolver: zodResolver(requestCodeRequestSchema),
    defaultValues: { email: "" },
  });
  const codeForm = useForm<VerifyCodeRequest>({
    resolver: zodResolver(verifyCodeRequestSchema),
    defaultValues: { email: "", code: "" },
  });

  const request = useMutation({
    mutationFn: (body: RequestCodeRequest) =>
      unwrap(browserApi.POST("/v1/client-auth/code", { body })),
    onSuccess: (_, body) => {
      setEmail(body.email);
      codeForm.reset({ email: body.email, code: "" });
    },
  });
  const verify = useMutation({
    mutationFn: (body: VerifyCodeRequest) =>
      unwrap(browserApi.POST("/v1/client-auth/code/verify", { body })),
    onSuccess: () => {
      router.replace("/client/home");
      router.refresh();
    },
  });

  if (email === null) {
    const error = request.error instanceof ApiRequestError ? request.error : null;
    return (
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={emailForm.handleSubmit((values) => request.mutate(values))}
      >
        {error ? <FormAlert>{error.message}</FormAlert> : null}
        <Field label="Email" error={emailForm.formState.errors.email?.message} required>
          <Input
            type="email"
            autoComplete="email"
            inputMode="email"
            {...emailForm.register("email")}
          />
        </Field>
        <Button type="submit" size="lg" loading={request.isPending} disabled={!online}>
          Get a sign-in code
        </Button>
      </form>
    );
  }

  const error = verify.error instanceof ApiRequestError ? verify.error : null;
  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={codeForm.handleSubmit((values) => verify.mutate(values))}
    >
      <FormAlert tone="info">
        If {email} can sign in, we&apos;ve sent it a {CLIENT_OTP_LENGTH}-digit code. It expires in{" "}
        {CLIENT_OTP_TTL_MINUTES} minutes.
      </FormAlert>
      {error && !error.body.fieldErrors ? <FormAlert>{error.message}</FormAlert> : null}
      <Field
        label="Sign-in code"
        error={codeForm.formState.errors.code?.message ?? error?.body.fieldErrors?.code?.[0]}
        required
      >
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CLIENT_OTP_LENGTH}
          {...codeForm.register("code")}
        />
      </Field>
      <Button type="submit" size="lg" loading={verify.isPending} disabled={!online}>
        Sign in
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <button
          type="button"
          className="min-h-11 font-medium underline underline-offset-2"
          onClick={() => {
            verify.reset();
            setEmail(null);
          }}
        >
          Use another email
        </button>
        <button
          type="button"
          className="min-h-11 font-medium underline underline-offset-2 disabled:opacity-50"
          disabled={request.isPending || !online}
          onClick={() => request.mutate({ email })}
        >
          Send a new code
        </button>
      </div>
    </form>
  );
}
