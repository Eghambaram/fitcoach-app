import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { EXERCISE_PARAMS } from "@/features/exercises/exercise-params";
import { ExercisesScreen } from "@/features/exercises/exercises-screen";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Exercise library" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Exercise library (PROMPT §8.5). Search and filters live in the URL. */
export default async function ExercisesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const query: Record<string, string> = {};
  for (const name of EXERCISE_PARAMS) {
    const value = raw[name];
    const single = Array.isArray(value) ? value[0] : value;
    if (single) query[name] = single;
  }
  const api = await serverApi();
  const { data } = await api.GET("/v1/exercises", { params: { query: query as never } });
  if (!data) {
    return (
      <Card>
        <ErrorState description="We couldn't load the exercise library. Check the filters or try again." />
      </Card>
    );
  }
  return <ExercisesScreen list={data} />;
}
