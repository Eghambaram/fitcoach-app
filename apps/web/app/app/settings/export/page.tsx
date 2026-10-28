import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { DataExportPanel } from "@/features/beta/data-export";
import { SettingsPage } from "@/features/settings/settings-page";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Export your data" };

/** Data export (PROMPT §8.12). Available even when the workspace is suspended (§16.0). */
export default async function DataExportPage() {
  const api = await serverApi();
  const { data, response } = await api.GET("/v1/exports");

  return (
    <SettingsPage
      title="Export your data"
      description="Your data is yours. Download a copy any time."
    >
      {response.ok && data ? (
        <DataExportPanel initial={data} />
      ) : (
        <Card>
          <ErrorState description="We couldn't load your exports. Please try again." />
        </Card>
      )}
    </SettingsPage>
  );
}
