import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { ProgramsScreen } from "@/features/programs/programs-screen";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Programs" };

/** Programs (PROMPT §8.5): starter templates and the way into the exercise library. */
export default async function ProgramsPage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/programs/templates");
  if (!data) {
    return (
      <Card>
        <ErrorState description="We couldn't load the program templates. Please try again." />
      </Card>
    );
  }
  return <ProgramsScreen data={data} />;
}
