import type { Metadata } from "next";
import { WorkoutError } from "@/features/workouts/live-workout";
import { TrainerLiveWorkout } from "@/features/workouts/trainer-live-workout";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Workout" };

/** A client's workout: preview, live logging, then the summary (PROMPT §8.5). */
export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await serverApi();
  const { data, response } = await api.GET("/v1/workout-sessions/{id}", {
    params: { path: { id } },
  });
  if (!data) return <WorkoutError missing={response.status === 404 || response.status === 400} />;
  return <TrainerLiveWorkout key={data.id} initial={data} />;
}
