"use client";

import {
  EQUIPMENT_LABELS,
  MUSCLE_GROUP_LABELS,
  type ClientWorkoutResponse,
  type WorkoutDetail,
} from "@fitcoach/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { dayLabel } from "../calendar/dates";
import { LiveWorkout } from "../workouts/live-workout";
import { clientWorkoutApi } from "../workouts/workout-api";
import { WorkoutStatusPill } from "./client-display";

function target(item: WorkoutDetail["exercises"][number]): string {
  const effort =
    item.durationSeconds !== null
      ? `${item.durationSeconds}s`
      : item.repsMax !== null && item.repsMax !== item.repsMin
        ? `${item.repsMin}–${item.repsMax} reps`
        : `${item.repsMin} reps`;
  return `${item.sets} × ${effort}${item.targetLoadKg !== null ? ` × ${item.targetLoadKg} kg` : ""}`;
}

/**
 * Workout details (client board 4): overview (notes, equipment, estimated time, muscle groups) and
 * exercises. "Start workout" only when the trainer turned self-logging on (§9).
 */
function WorkoutDetails({
  workout,
  canLog,
  onStart,
  starting,
}: {
  workout: WorkoutDetail;
  canLog: boolean;
  onStart: () => void;
  starting: boolean;
}) {
  const online = useOnline();
  const [tab, setTab] = useState<"overview" | "exercises">("overview");
  const equipment = [...new Set(workout.exercises.flatMap((item) => item.exercise.equipment))];
  const muscles = [...new Set(workout.exercises.flatMap((item) => item.exercise.muscleGroups))];
  const logged = workout.exercises.filter((item) => item.logged.some((set) => set.completed));
  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/client/workouts"
        className="flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" /> My workouts
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{workout.name}</h1>
          <p className="text-sm text-muted-foreground">
            {dayLabel(workout.scheduledOn, "long")} · about {workout.summary.estimatedMinutes} min
            (estimate) · {workout.exercises.length} exercises
          </p>
        </div>
        <WorkoutStatusPill status={workout.status} />
      </div>
      {canLog && workout.status === "planned" ? (
        <Button size="lg" loading={starting} disabled={!online} onClick={onStart}>
          Start workout
        </Button>
      ) : workout.status === "planned" || workout.status === "in_progress" ? (
        <p className="text-sm text-muted-foreground">
          Your trainer logs this workout with you during your session.
        </p>
      ) : null}

      <div role="tablist" aria-label="Workout" className="grid grid-cols-2 border-b border-border">
        {(
          [
            ["overview", "Overview"],
            ["exercises", "Exercises"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "min-h-11 border-b-2 text-sm font-semibold",
              tab === value ? "border-charcoal" : "border-transparent text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div role="tabpanel" className="flex flex-col gap-4">
          {workout.program.notes || workout.program.instructions ? (
            <Card className="flex flex-col gap-2 p-4 text-sm">
              <h2 className="font-semibold">Notes from your trainer</h2>
              {workout.program.notes ? (
                <p className="whitespace-pre-line">{workout.program.notes}</p>
              ) : null}
              {workout.program.instructions ? (
                <p className="whitespace-pre-line">{workout.program.instructions}</p>
              ) : null}
            </Card>
          ) : null}
          <Card className="flex flex-col gap-2 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4" aria-hidden="true" />
              Estimated time
            </h2>
            <p className="text-sm">About {workout.summary.estimatedMinutes} minutes</p>
          </Card>
          {equipment.length > 0 ? (
            <Card className="flex flex-col gap-2 p-4">
              <h2 className="text-sm font-semibold">Equipment</h2>
              <ul className="flex flex-wrap gap-2">
                {equipment.map((item) => (
                  <li key={item}>
                    <StatusPill tone="neutral">{EQUIPMENT_LABELS[item]}</StatusPill>
                  </li>
                ))}
              </ul>
              {workout.program.equipmentNotes ? (
                <p className="text-sm text-muted-foreground">{workout.program.equipmentNotes}</p>
              ) : null}
            </Card>
          ) : null}
          {muscles.length > 0 ? (
            <Card className="flex flex-col gap-2 p-4">
              <h2 className="text-sm font-semibold">Muscle groups</h2>
              <ul className="flex flex-wrap gap-2">
                {muscles.map((item) => (
                  <li key={item}>
                    <StatusPill tone="lime">{MUSCLE_GROUP_LABELS[item]}</StatusPill>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {logged.length > 0 ? (
            <Card className="flex flex-col gap-2 p-4 text-sm">
              <h2 className="font-semibold">Logged so far</h2>
              {logged.map((item) => (
                <p key={item.id ?? item.position}>
                  {item.exercise.name}: {item.logged.filter((set) => set.completed).length} of{" "}
                  {item.sets} sets
                </p>
              ))}
            </Card>
          ) : null}
        </div>
      ) : (
        <ol
          role="tabpanel"
          className="flex flex-col divide-y divide-border rounded-card border border-border bg-card"
        >
          {workout.exercises.map((item) => (
            <li key={item.id ?? item.position} className="flex flex-col gap-1 px-4 py-3 text-sm">
              <span className="font-medium">
                {item.position}. {item.exercise.name}
              </span>
              <span className="text-muted-foreground">
                {target(item)}
                {item.restSeconds ? ` · rest ${item.restSeconds}s` : ""}
              </span>
              {item.clientInstructions ? <span>{item.clientInstructions}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** `/client/workouts/[id]`: details, or the shared live workout once the client logs it. */
export function ClientWorkout({ initial }: { initial: ClientWorkoutResponse }) {
  const api = useMemo(() => clientWorkoutApi(initial.workout.id), [initial.workout.id]);
  const queryClient = useQueryClient();
  const [live, setLive] = useState<WorkoutDetail | null>(
    initial.canLog && initial.workout.status === "in_progress" ? initial.workout : null,
  );
  const start = useMutation({
    mutationFn: () => api.start(),
    onSuccess: (next) => {
      queryClient.setQueryData(api.key, next);
      setLive(next);
    },
    onError: (failure) => toast.error(failure.message),
  });
  const finished = initial.workout.status === "completed" || initial.workout.status === "skipped";

  if (live || (finished && initial.workout.exercises.some((item) => item.id !== null))) {
    return (
      <LiveWorkout
        initial={live ?? initial.workout}
        api={api}
        audience="client"
        back={{ href: "/client/workouts", label: "My workouts" }}
      />
    );
  }
  return (
    <WorkoutDetails
      workout={initial.workout}
      canLog={initial.canLog}
      onStart={() => start.mutate()}
      starting={start.isPending}
    />
  );
}
