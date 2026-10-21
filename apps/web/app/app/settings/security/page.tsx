import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { ChangePasswordForm } from "@/features/settings/change-password-form";
import { SessionsList } from "@/features/settings/sessions-list";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Security" };

export default async function SecuritySettingsPage() {
  const api = await serverApi();
  const { data, response } = await api.GET("/v1/auth/sessions");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/settings" className="text-sm text-muted-foreground hover:text-foreground">
          ← Settings
        </Link>
        <PageHeader
          className="mt-2"
          title="Security"
          description="Your password and the devices where you're signed in."
        />
      </div>
      <Card className="p-5">
        <ChangePasswordForm />
      </Card>
      <Card className="p-2 sm:p-4">
        {response.ok && data ? (
          <SessionsList sessions={data.sessions} />
        ) : (
          <ErrorState description="We couldn't load your sessions. Please try again." />
        )}
      </Card>
    </div>
  );
}
