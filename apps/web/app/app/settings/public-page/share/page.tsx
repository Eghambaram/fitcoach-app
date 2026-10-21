import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { SettingsPage } from "@/features/settings/settings-page";
import { ShareScreen } from "@/features/settings/share-screen";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Share your page" };

/** Share screen (PROMPT §8.2): link, QR (PNG/SVG), Web Share, per-source links. */
export default async function SharePublicPagePage() {
  const api = await serverApi();
  const { data: page, response } = await api.GET("/v1/settings/public-page");

  return (
    <SettingsPage
      title="Share your enquiry page"
      description="Put your link and QR code wherever people find you."
    >
      {response.ok && page ? (
        <ShareScreen page={page} />
      ) : (
        <Card>
          <ErrorState description="We couldn't load your page link. Please try again." />
        </Card>
      )}
    </SettingsPage>
  );
}
