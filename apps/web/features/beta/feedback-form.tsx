"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  FEEDBACK_MESSAGE_MAX,
  type FeedbackRequest,
  feedbackRequestSchema,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";

/** "Send feedback" (PROMPT §16.0). The page it was opened from goes along, so we know the context. */
export function FeedbackForm({ page }: { page?: string }) {
  const online = useOnline();
  const form = useForm<FeedbackRequest>({
    resolver: zodResolver(feedbackRequestSchema),
    defaultValues: { message: "", page },
  });
  const { register, handleSubmit, formState, setError, reset, control } = form;
  const length = useWatch({ control, name: "message" }).length;

  const send = useMutation({
    mutationFn: (body: FeedbackRequest) => unwrap(browserApi.POST("/v1/feedback", { body })),
    onError: (error) => {
      if (error instanceof ApiRequestError && error.body.fieldErrors) {
        applyFieldErrors(error, setError, ["message"]);
      } else {
        toast.error(error.message);
      }
    },
  });

  if (send.isSuccess) {
    return (
      <div className="flex flex-col items-start gap-4" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          Thanks, your feedback was saved.
        </p>
        <p className="text-sm text-muted-foreground">
          The FitCoach team reads every message during the beta. We may reply by email.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              reset({ message: "", page });
              send.reset();
            }}
          >
            Send more feedback
          </Button>
          {page ? (
            <Button asChild variant="ghost">
              <Link href={page}>Back to where you were</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit((body) => send.mutate(body))}
      className="flex flex-col gap-4"
    >
      <Field
        label="What's working, what's broken, what's missing?"
        error={formState.errors.message?.message}
        hint={`${length}/${FEEDBACK_MESSAGE_MAX} characters. Please don't include client health details.`}
        required
      >
        <Textarea rows={6} maxLength={FEEDBACK_MESSAGE_MAX} {...register("message")} />
      </Field>
      {page ? (
        <p className="text-sm text-muted-foreground">
          Sent from <span className="font-mono text-foreground">{page}</span>
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="dark" loading={send.isPending} disabled={!online}>
          Send feedback
        </Button>
      </div>
    </form>
  );
}
