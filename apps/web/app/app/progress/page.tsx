import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/status";
import { ProgressOverview } from "@/features/progress/progress-overview";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Progress" };

/** Progress overview (PROMPT §8.8). */
export default async function ProgressPage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/progress");
  if (!data) {
    return (
      <Card>
        <ErrorState description="We couldn't load progress. Please try again." />
      </Card>
    );
  }
  return <ProgressOverview data={data} />;
}
