import type { Metadata } from "next";
import Link from "next/link";
import { ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { ClientWorkout } from "@/features/client-portal/client-workout";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Workout" };

export default async function ClientWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await serverApi();
  const { data, response } = await api.GET("/v1/client/workouts/{id}", {
    params: { path: { id } },
  });
  if (!data) {
    const missing = response.status === 404 || response.status === 400;
    return (
      <ErrorState
        title={missing ? "Workout not found" : undefined}
        description={
          missing
            ? "This link doesn't match one of your workouts."
            : "We couldn't load this workout. Please try again."
        }
        action={
          <Button variant="outline" asChild>
            <Link href="/client/workouts">My workouts</Link>
          </Button>
        }
      />
    );
  }
  return <ClientWorkout key={data.workout.id} initial={data} />;
}
