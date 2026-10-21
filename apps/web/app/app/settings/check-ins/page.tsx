import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { SettingsPage } from "@/features/settings/settings-page";
import { CheckInRulesForm } from "@/features/settings/workspace-forms";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Check-ins & attention" };

/** Default check-in cadence and "needs attention" thresholds (PROMPT §8.12). */
export default async function CheckInSettingsPage() {
  const api = await serverApi();
  const { data, response } = await api.GET("/v1/settings");

  return (
    <SettingsPage
      title="Check-ins & attention"
      description="When clients check in and when they need your attention."
    >
      {response.ok && data ? (
        <CheckInRulesForm value={data.checkIns} />
      ) : (
        <Card>
          <ErrorState description="We couldn't load these settings. Please try again." />
        </Card>
      )}
    </SettingsPage>
  );
}
