import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ErrorState, PermissionDenied } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/features/shell/app-shell";
import { getSession } from "@/lib/api/server";
import Link from "next/link";

/**
 * Trainer workspace (/app/*). Who may see it is decided by the API: the layout asks
 * `GET /v1/auth/me` with the forwarded cookie and only renders the shell for trainers.
 */
export default async function TrainerLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (session.status === "signed_out") redirect("/login?next=/app/dashboard");
  if (session.status === "unavailable") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <ErrorState
          title="FitCoach is temporarily unavailable"
          description="We couldn't reach our servers. Please try again in a moment."
          action={
            <Button asChild variant="outline">
              <Link href="/app/dashboard">Try again</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const { me } = session;
  if (me.actor !== "trainer" || !me.workspace) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <PermissionDenied description="The trainer workspace is only for trainer accounts." />
      </main>
    );
  }

  const banner =
    me.workspace.status === "pending_approval" ? (
      <div
        role="status"
        className="bg-warning-soft px-4 py-2 text-center text-sm font-medium text-warning"
      >
        Your account is waiting for approval. You'll get an email when it's ready.
      </div>
    ) : me.workspace.status === "suspended" ? (
      <div
        role="status"
        className="bg-danger-soft px-4 py-2 text-center text-sm font-medium text-danger"
      >
        Your workspace is suspended, so it's read-only. You can still export your data.
      </div>
    ) : null;

  return (
    <AppShell
      area="trainer"
      userName={me.profile.displayName}
      avatarUrl={me.profile.avatarUrl}
      subtitle={me.workspace.name}
      banner={banner}
    >
      {children}
    </AppShell>
  );
}
