import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { ClientCheckIn } from "@/features/client-portal/client-check-in";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Check-in" };

/** Daily check-in (PROMPT §8.7, §9). */
export default async function ClientCheckInPage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/client/check-in");
  if (!data) return <ErrorState description="We couldn't load your check-in. Please try again." />;
  return <ClientCheckIn initial={data} />;
}
