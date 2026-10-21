import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { PackagePresets } from "@/features/settings/package-presets";
import { SettingsPage } from "@/features/settings/settings-page";
import { PackagePolicyForm } from "@/features/settings/workspace-forms";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Packages" };

/** Package presets and the no-show / late-cancel policy (PROMPT §8.3A, §8.12, D25). */
export default async function PackagesSettingsPage() {
  const api = await serverApi();
  const [presets, settings] = await Promise.all([
    api.GET("/v1/settings/package-presets"),
    api.GET("/v1/settings"),
  ]);

  return (
    <SettingsPage
      title="Packages"
      description="What you sell, and how attendance counts against it."
    >
      {presets.response.ok && presets.data && settings.response.ok && settings.data ? (
        <>
          <PackagePresets presets={presets.data.presets} />
          <PackagePolicyForm value={settings.data.packagePolicy} />
        </>
      ) : (
        <Card>
          <ErrorState description="We couldn't load your package settings. Please try again." />
        </Card>
      )}
    </SettingsPage>
  );
}
