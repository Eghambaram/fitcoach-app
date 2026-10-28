import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { ClientProgress } from "@/features/client-portal/client-progress";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "My progress" };

/** My progress: shared metrics only (PROMPT §8.8, §9). */
export default async function ClientProgressPage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/client/progress");
  if (!data) return <ErrorState description="We couldn't load your progress. Please try again." />;
  return <ClientProgress initial={data} />;
}
