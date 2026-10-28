import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { BetaInvites } from "@/features/platform/beta-invites";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Platform settings" };

/** Platform settings (PROMPT §16.0): beta invite codes. Plans and billing are v1.1. */
export default async function PlatformSettingsPage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/platform/beta-invites");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Beta invite codes. During the closed beta, trainers need a code to sign up."
      />
      {data ? (
        <BetaInvites initial={data.items} />
      ) : (
        <Card>
          <ErrorState description="We couldn't load invite codes. Please try again." />
        </Card>
      )}
      <p className="text-sm text-muted-foreground">
        Platform owners are added with{" "}
        <span className="font-mono">pnpm platform:grant &lt;email&gt;</span> (audited). Each signs
        in at /platform/login with an authenticator app.
      </p>
    </div>
  );
}
