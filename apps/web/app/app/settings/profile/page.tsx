import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { ProfilePhoto } from "@/features/settings/profile-photo";
import { getSession } from "@/lib/api/server";

export const metadata: Metadata = { title: "Profile" };

/** Profile settings. Name, headline, bio and the public page arrive in step 2.1. */
export default async function ProfileSettingsPage() {
  const session = await getSession();
  if (session.status !== "signed_in") return null;
  const { profile } = session.me;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/app/settings" className="text-sm text-muted-foreground hover:text-foreground">
          ← Settings
        </Link>
        <PageHeader className="mt-2" title="Profile" description="How you appear to clients." />
      </div>
      <Card className="p-5">
        <ProfilePhoto displayName={profile.displayName} avatarUrl={profile.avatarUrl} />
      </Card>
    </div>
  );
}
