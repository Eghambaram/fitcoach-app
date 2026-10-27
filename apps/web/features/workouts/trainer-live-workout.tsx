"use client";

import type { WorkoutDetail } from "@fitcoach/shared";
import { useMemo } from "react";
import { LiveWorkout } from "./live-workout";
import { trainerWorkoutApi } from "./workout-api";

/** `/app/workouts/[id]`: the trainer logs a client's workout (PROMPT §8.5). */
export function TrainerLiveWorkout({ initial }: { initial: WorkoutDetail }) {
  const api = useMemo(() => trainerWorkoutApi(initial.id), [initial.id]);
  return (
    <LiveWorkout
      initial={initial}
      api={api}
      back={{
        href: `/app/clients/${initial.client.id}?tab=workouts`,
        label: initial.client.fullName,
      }}
    />
  );
}
