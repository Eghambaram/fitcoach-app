import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ErrorState, PermissionDenied } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/features/shell/app-shell";
import { getSession, serverApi } from "@/lib/api/server";

/**
 * Platform owner area (/platform/*, PROMPT §16.0). The API decides: `GET /v1/platform/access`
 * answers 401/403 for anyone who isn't a platform owner with a verified authenticator code, and
 * this layout turns that into the sign-in page or a refusal — never the admin shell.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (session.status === "signed_out") redirect("/platform/login");

  const api = await serverApi();
  const { response } = await api.GET("/v1/platform/access");

  if (response.status === 401) redirect("/platform/login");
  // A platform session refused here hasn't entered its authenticator code yet (MFA_REQUIRED).
  if (
    response.status === 403 &&
    session.status === "signed_in" &&
    session.me.actor === "platform_owner"
  ) {
    redirect("/platform/login");
  }
  if (response.status === 403) {
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
    <AppShell area="platform" userName={session.me.profile.displayName} badge="Platform owner">
      {children}
    </AppShell>
  );
}
