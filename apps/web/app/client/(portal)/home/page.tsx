import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { ClientHome } from "@/features/client-portal/client-home";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Home" };

/** Client home (PROMPT §9). */
export default async function ClientHomePage() {
  const api = await serverApi();
  const [me, home] = await Promise.all([api.GET("/v1/client/me"), api.GET("/v1/client/home")]);
  if (!me.data || !home.data) {
    return <ErrorState description="We couldn't load your home screen. Please try again." />;
  }
  return <ClientHome me={me.data} home={home.data} />;
}
