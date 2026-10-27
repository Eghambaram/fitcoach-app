import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { ClientWorkouts } from "@/features/client-portal/client-workouts";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "My workouts" };

export default async function ClientWorkoutsPage() {
  const api = await serverApi();
  const [me, list] = await Promise.all([api.GET("/v1/client/me"), api.GET("/v1/client/workouts")]);
  if (!me.data || !list.data) {
    return <ErrorState description="We couldn't load your workouts. Please try again." />;
  }
  return <ClientWorkouts data={list.data} canLog={me.data.features.workoutSelfLogging} />;
}
