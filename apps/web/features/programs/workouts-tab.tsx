"use client";

import {
  type WorkoutSession,
  WEEKDAY_LABELS,
  WORKOUT_SESSION_STATUS_LABELS,
  type WorkoutSessionStatus,
} from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dumbbell } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog } from "@/components/shared/overlays";
import { EmptyState, ErrorState, type PillTone, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { browserApi, unwrap } from "@/lib/api/browser";
import { dayLabel } from "../calendar/dates";

const STATUS_TONES: Record<WorkoutSessionStatus, PillTone> = {
  planned: "info",
  in_progress: "warning",
  completed: "success",
  skipped: "neutral",
};

function SessionList({ sessions, empty }: { sessions: WorkoutSession[]; empty: string }) {
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
      {sessions.map((session) => (
        <li
          key={session.id}
          className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
        >
          <span>
            <span className="font-medium">{dayLabel(session.scheduledOn)}</span> · {session.name}
          </span>
          <StatusPill tone={STATUS_TONES[session.status]}>
            {WORKOUT_SESSION_STATUS_LABELS[session.status]}
          </StatusPill>
        </li>
      ))}
    </ul>
  );
}

/** Client detail → Workouts (PROMPT §8.5): the assigned program and its planned workouts. */
export function WorkoutsTab({ clientId, archived }: { clientId: string; archived: boolean }) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [ending, setEnding] = useState(false);
  const key = ["client-workouts", clientId];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      unwrap(browserApi.GET("/v1/clients/{id}/workouts", { params: { path: { id: clientId } } })),
  });
  const end = useMutation({
    mutationFn: (assignmentId: string) =>
      unwrap(
        browserApi.POST("/v1/assignments/{id}/end", { params: { path: { id: assignmentId } } }),
      ),
    onSuccess: (next) => {
      queryClient.setQueryData(key, next);
      setEnding(false);
      toast.success("Program ended. Upcoming workouts were removed.");
    },
    onError: (failure) => toast.error(failure.message),
  });

  if (query.isPending) {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState description="We couldn't load their workouts. Please try again." />;
  }
  const { assignment, upcoming, recent } = query.data;
  const active = assignment?.status === "active";

  return (
    <div className="flex flex-col gap-5">
      {assignment && active ? (
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{assignment.name}</h2>
              <p className="text-sm text-muted-foreground">
                {dayLabel(assignment.startsOn)} – {dayLabel(assignment.endsOn)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {assignment.programId ? (
                <Button variant="outline" asChild>
                  <Link href={`/app/programs/${assignment.programId}`}>Open program</Link>
                </Button>
              ) : null}
              <Button variant="ghost" disabled={!online} onClick={() => setEnding(true)}>
                End program
              </Button>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2" aria-label="Schedule">
            {assignment.schedule
              .slice()
              .sort((a, b) => a.weekday - b.weekday)
              .map((slot) => (
                <li key={slot.workoutIndex}>
                  <StatusPill tone="neutral">
                    {WEEKDAY_LABELS[slot.weekday]}: {slot.name}
                  </StatusPill>
                </li>
              ))}
          </ul>
          {assignment.instructions ? (
            <p className="text-sm whitespace-pre-line">{assignment.instructions}</p>
          ) : null}
          {assignment.equipmentNotes ? (
            <p className="text-sm text-muted-foreground">
              Equipment / location: {assignment.equipmentNotes}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            They follow the program as it was when assigned. Workout logging comes next.
          </p>
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={Dumbbell}
            title={assignment ? "No current program" : "No program assigned"}
            description={
              assignment
                ? `${assignment.name} ${assignment.status === "completed" ? "finished" : "ended"} on ${dayLabel(assignment.endsOn)}.`
                : archived
                  ? "Restore this client to assign a program."
                  : "Build or pick a program, then assign it to them from the program."
            }
            action={
              archived ? undefined : (
                <Button asChild>
                  <Link href="/app/programs">Choose a program</Link>
                </Button>
              )
            }
          />
        </Card>
      )}

      <section aria-labelledby="upcoming-workouts" className="flex flex-col gap-2">
        <h3 id="upcoming-workouts" className="font-semibold">
          Upcoming workouts
        </h3>
        <SessionList sessions={upcoming} empty="Nothing planned." />
      </section>
      <section aria-labelledby="recent-workouts" className="flex flex-col gap-2">
        <h3 id="recent-workouts" className="font-semibold">
          Recent
        </h3>
        <SessionList sessions={recent} empty="No past workouts yet." />
      </section>

      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title="End this program?"
        description="Their upcoming planned workouts are removed. Anything they've already done stays."
        confirmLabel="End program"
        destructive
        pending={end.isPending}
        onConfirm={() => (assignment ? end.mutate(assignment.id) : null)}
      />
    </div>
  );
}
