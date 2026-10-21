import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { ProfilePhoto } from "@/features/settings/profile-photo";
import { PublicPageForm } from "@/features/settings/public-page-form";
import { PublishCard } from "@/features/settings/publish-card";
import { SettingsPage } from "@/features/settings/settings-page";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Profile & public page" };

/** Profile & public page (PROMPT §8.12): photo, details, page address, enquiry form, publishing. */
export default async function ProfileSettingsPage() {
  const api = await serverApi();
  const { data: page, response } = await api.GET("/v1/settings/public-page");

  return (
    <SettingsPage
      title="Profile & public page"
      description="How you appear to clients and on your enquiry page."
    >
      {response.ok && page ? (
        <>
          <PublishCard page={page} />
          <Card className="p-5">
            <ProfilePhoto displayName={page.displayName} avatarUrl={page.avatarUrl} />
          </Card>
          {/* Remount after a save so the form starts from what the server stored. */}
          <PublicPageForm key={`${page.form.version}-${page.slug}`} page={page} />
        </>
      ) : (
        <Card>
          <ErrorState description="We couldn't load your page settings. Please try again." />
        </Card>
      )}
    </SettingsPage>
  );
}
