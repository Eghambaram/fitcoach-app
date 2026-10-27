import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { ClientMore } from "@/features/client-portal/client-more";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "More" };

export default async function ClientMorePage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/client/me");
  if (!data) return <ErrorState description="We couldn't load this page. Please try again." />;
  return <ClientMore me={data} />;
}
