import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { ClientProfile } from "@/features/client-portal/client-profile";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ClientProfilePage() {
  const api = await serverApi();
  const [profile, home] = await Promise.all([
    api.GET("/v1/client/profile"),
    api.GET("/v1/client/home"),
  ]);
  if (!profile.data || !home.data) {
    return <ErrorState description="We couldn't load your profile. Please try again." />;
  }
  return <ClientProfile initial={profile.data} today={home.data.today} />;
}
