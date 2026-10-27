import type { Metadata } from "next";
import { ClientHome } from "@/features/client-portal/client-home";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Home" };

/** Client home (PROMPT §9). Workouts, sessions and progress tiles arrive with step 4.2. */
export default async function ClientHomePage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/client/me");
  if (!data) return null;
  return <ClientHome me={data} />;
}
