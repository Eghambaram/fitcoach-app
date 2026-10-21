import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { SettingsPage } from "@/features/settings/settings-page";
import { LocaleForm } from "@/features/settings/workspace-forms";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Units & locale" };

/** Units, time zone and country (PROMPT §8.12, D16). */
export default async function LocaleSettingsPage() {
  const api = await serverApi();
  const { data, response } = await api.GET("/v1/settings");

  return (
    <SettingsPage
      title="Units & locale"
      description="Units, time zone and country for your workspace."
    >
      {response.ok && data ? (
        <LocaleForm value={data.locale} />
      ) : (
        <Card>
          <ErrorState description="We couldn't load these settings. Please try again." />
        </Card>
      )}
    </SettingsPage>
  );
}
