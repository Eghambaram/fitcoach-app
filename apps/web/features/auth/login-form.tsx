"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type LoginRequest, loginRequestSchema } from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { FormAlert } from "./auth-layout";
import { PasswordInput } from "./password-input";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const online = useOnline();
  const form = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { email: "", password: "" },
  });

  const login = useMutation({
    mutationFn: (body: LoginRequest) => unwrap(browserApi.POST("/v1/auth/login", { body })),
    onSuccess: () => {
      router.replace(next);
      router.refresh();
    },
  });

  const error = login.error instanceof ApiRequestError ? login.error : null;

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => login.mutate(values))}
      className="flex flex-col gap-5"
    >
      {error ? (
        <FormAlert tone={error.code === "EMAIL_NOT_VERIFIED" ? "info" : "danger"}>
          {error.message}
        </FormAlert>
      ) : null}
      <Field label="Email" error={form.formState.errors.email?.message} required>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
      </Field>
      <Field
        label="Password"
        error={form.formState.errors.password?.message}
        required
        hint={
          <Link
            href="/forgot-password"
            className="font-medium text-foreground underline underline-offset-2"
          >
            Forgot your password?
          </Link>
        }
      >
        <PasswordInput autoComplete="current-password" {...form.register("password")} />
      </Field>
      <Button type="submit" size="lg" loading={login.isPending} disabled={!online}>
        Log in
      </Button>
    </form>
  );
}
