"use client";

import {
  type CheckIn,
  FEELING_LABELS,
  SORENESS_LABELS,
  type TrainerCheckIn,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { dayLabel } from "../calendar/dates";
import { formatDateTime } from "../leads/lead-display";

/**
 * One check-in for the trainer (PROMPT §8.7): the client's self-reported answers, then "Mark
 * reviewed" with an optional reply note the client sees.
 */
export function CheckInCard({
  checkIn,
  client,
  onReviewed,
}: {
  checkIn: CheckIn;
  /** Shown in the inbox; omitted on the client's own tab. */
  client?: TrainerCheckIn["client"];
  onReviewed: (next: TrainerCheckIn) => void;
}) {
  const online = useOnline();
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const review = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.POST("/v1/check-ins/{id}/review", {
          params: { path: { id: checkIn.id } },
          body: { reply },
        }),
      ),
    onSuccess: (next) => {
      setReply("");
      setReplying(false);
      onReviewed(next);
      toast.success("Marked reviewed.");
    },
    onError: (failure) => toast.error(failure.message),
  });
  const reviewed = checkIn.reviewedAt !== null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {client ? (
            <Link
              href={`/app/clients/${client.id}?tab=check-ins`}
              className="font-semibold underline-offset-2 hover:underline"
            >
              {client.fullName}
            </Link>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {dayLabel(checkIn.localDate, "long")} · sent {formatDateTime(checkIn.submittedAt)}
            {checkIn.edited ? " · edited" : ""}
          </p>
        </div>
        {reviewed ? (
          <StatusPill tone="success">Reviewed</StatusPill>
        ) : (
          <StatusPill tone="warning">To review</StatusPill>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        {(
          [
            ["Feeling", FEELING_LABELS[checkIn.feeling]],
            ["Energy", `${checkIn.energy}/10`],
            ["Sleep", `${checkIn.sleep}/10`],
            ["Soreness", SORENESS_LABELS[checkIn.soreness]],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-control bg-muted px-3 py-2">
            <dt className="text-xs font-medium text-foreground">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {checkIn.notes ? (
        <p className="text-sm whitespace-pre-line">
          <span className="font-medium">Notes:</span> {checkIn.notes}
        </p>
      ) : null}
      {checkIn.workoutFeedback ? (
        <p className="text-sm whitespace-pre-line">
          <span className="font-medium">Workout:</span> {checkIn.workoutFeedback}
        </p>
      ) : null}
      {checkIn.reply ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">Your reply:</span> {checkIn.reply}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">Self-reported by the client.</p>
      {reviewed && !replying ? (
        <Button variant="ghost" className="self-start" onClick={() => setReplying(true)}>
          Reply again
        </Button>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            review.mutate();
          }}
        >
          <Field label="Reply to the client (optional)">
            <Textarea
              rows={2}
              maxLength={1000}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
            />
          </Field>
          <Button
            type="submit"
            variant="dark"
            className="self-start"
            loading={review.isPending}
            disabled={!online}
          >
            <Check aria-hidden="true" />
            {reviewed ? "Send reply" : "Mark reviewed"}
          </Button>
        </form>
      )}
      {reviewed && checkIn.reviewedAt ? (
        <p className="text-xs text-muted-foreground">
          Reviewed {formatDateTime(checkIn.reviewedAt)}
        </p>
      ) : null}
    </Card>
  );
}
