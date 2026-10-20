import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ErrorState, PermissionDenied } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/features/shell/app-shell";
import { getSession, serverApi } from "@/lib/api/server";

/**
 * Platform owner area (/platform/*, PROMPT §16.0). The API decides: `GET /v1/platform/access` is
 * refused for trainers and clients, and this layout shows that refusal instead of the admin shell.
 * The separate platform login with mandatory TOTP arrives in step 6.1.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (session.status === "signed_out") redirect("/login?next=/platform");

  const api = await serverApi();
  const { response } = await api.GET("/v1/platform/access");

  if (response.status === 401 || response.status === 403) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <PermissionDenied
          description="This area is only for the FitCoach team."
          action={
            <Button asChild variant="outline">
              <Link href="/app/dashboard">Back to your dashboard</Link>
            </Button>
          }
        />
      </main>
    );
  }
  if (!response.ok || session.status !== "signed_in") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <ErrorState title="FitCoach is temporarily unavailable" />
      </main>
    );
  }

  return (
    <AppShell area="platform" userName={session.me.profile.displayName} badge="Super Admin">
      {children}
    </AppShell>
  );
}
