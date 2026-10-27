"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { FormAlert } from "../auth/auth-layout";

/**
 * `/invite/[token]` (PROMPT §9, D19): who invited them, accept the terms, and land signed in.
 * The preview never shows the client's own data; the link works once.
 */
export function InviteWelcome({ token }: { token: string }) {
  const router = useRouter();
  const online = useOnline();
  const [accepted, setAccepted] = useState(false);
  const [touched, setTouched] = useState(false);
  const preview = useQuery({
    queryKey: ["invite-preview", token],
    queryFn: () => unwrap(browserApi.POST("/v1/client-auth/invite/preview", { body: { token } })),
    retry: false,
    staleTime: Infinity,
  });
  const accept = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.POST("/v1/client-auth/invite/accept", {
          body: { token, acceptTerms: true },
        }),
      ),
    onSuccess: () => {
      router.replace("/client/home");
      router.refresh();
    },
  });

  if (preview.isPending) {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Checking your link…
      </p>
    );
  }
  if (preview.isError) {
    const expired =
      preview.error instanceof ApiRequestError && preview.error.code === "TOKEN_INVALID";
    return (
      <div className="flex flex-col gap-4">
        <FormAlert>
          {expired
            ? "This link has expired or was already used."
            : "We couldn't check this link. Please try again."}
        </FormAlert>
        <p className="text-sm text-muted-foreground">
          Ask your trainer to send you a new link on WhatsApp, or sign in with a code sent to your
          email.
        </p>
        <Button asChild variant="dark" size="lg">
          <Link href="/client/login">Sign in with an email code</Link>
        </Button>
      </div>
    );
  }

  const { trainerName, businessName, trainerAvatarUrl } = preview.data;
  const error = accept.error instanceof ApiRequestError ? accept.error : null;
  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (accepted) accept.mutate();
      }}
    >
      <div className="flex items-center gap-4 rounded-card border border-border bg-card p-4">
        {trainerAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public-bucket photo, already resized by the API
          <img
            src={trainerAvatarUrl}
            alt=""
            width={56}
            height={56}
            className="size-14 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-lime text-lg font-bold text-lime-foreground"
          >
            {trainerName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div>
          <p className="font-semibold">{trainerName}</p>
          <p className="text-sm text-muted-foreground">{businessName}</p>
        </div>
      </div>
      <p className="text-sm">
        {trainerName} invited you to FitCoach to share your workouts, sessions and progress with
        you.
      </p>
      {error ? <FormAlert>{error.message}</FormAlert> : null}
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <Checkbox
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            aria-describedby={touched && !accepted ? "terms-error" : undefined}
            aria-invalid={touched && !accepted ? true : undefined}
          />
          <span>
            I accept the FitCoach terms of use and privacy policy, and agree that {trainerName} can
            see what I log here.
          </span>
        </label>
        {touched && !accepted ? (
          <p id="terms-error" className="text-sm text-danger">
            Accept the terms to continue
          </p>
        ) : null}
      </div>
      <Button type="submit" size="lg" loading={accept.isPending} disabled={!online}>
        Continue
      </Button>
    </form>
  );
}
