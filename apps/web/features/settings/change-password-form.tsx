"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  PASSWORD_MIN_LENGTH,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { PasswordInput } from "../auth/password-input";

/** Change password; the API signs out every other device (PROMPT §8.12, CLAUDE.md rule 9). */
export function ChangePasswordForm() {
  const router = useRouter();
  const online = useOnline();
  const form = useForm<ChangePasswordRequest>({
    resolver: zodResolver(changePasswordRequestSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });
  const { register, handleSubmit, formState, setError, reset } = form;
  const errors = formState.errors;

  const change = useMutation({
    mutationFn: (body: ChangePasswordRequest) =>
      unwrap(browserApi.POST("/v1/auth/password/change", { body })),
    onSuccess: () => {
      reset();
      toast.success("Password changed. You've been signed out on your other devices.");
      router.refresh();
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body.fieldErrors) {
        applyFieldErrors(error, setError, ["currentPassword", "newPassword"]);
      } else {
        toast.error(error.message);
      }
    },
  });

  return (
    <form
      noValidate
      onSubmit={handleSubmit((body) => change.mutate(body))}
      className="flex flex-col gap-4"
    >
      <h2 className="font-semibold">Change password</h2>
      <Field label="Current password" error={errors.currentPassword?.message} required>
        <PasswordInput autoComplete="current-password" {...register("currentPassword")} />
      </Field>
      <Field
        label="New password"
        error={errors.newPassword?.message}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A short sentence is easy to remember.`}
        required
      >
        <PasswordInput autoComplete="new-password" {...register("newPassword")} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="dark" loading={change.isPending} disabled={!online}>
          Change password
        </Button>
      </div>
    </form>
  );
}
