import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ErrorState, PermissionDenied } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { ClientShell } from "@/features/client-portal/client-shell";
import { serverApi } from "@/lib/api/server";

/**
 * Client portal (/client/*). The API decides who may see it: `GET /v1/client/me` answers only for a
 * client session, scoped to that client.
 */
export default async function ClientPortalLayout({ children }: { children: ReactNode }) {
  let result: Awaited<ReturnType<Awaited<ReturnType<typeof serverApi>>["GET"]>> | undefined;
  try {
    const api = await serverApi();
    result = await api.GET("/v1/client/me");
  } catch {
    result = undefined;
  }
  if (result?.response.status === 401) redirect("/client/login");
  if (result?.response.status === 403) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <PermissionDenied
          description="The client app is for clients invited by their trainer."
          action={
            <Button asChild variant="outline">
              <Link href="/app/dashboard">Go to your workspace</Link>
            </Button>
          }
        />
      </main>
    );
  }
  if (!result?.data) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <ErrorState
          title="FitCoach is temporarily unavailable"
          description="We couldn't reach our servers. Please try again in a moment."
          action={
            <Button asChild variant="outline">
              <Link href="/client/home">Try again</Link>
            </Button>
          }
        />
      </main>
    );
  }
  return <ClientShell me={result.data}>{children}</ClientShell>;
}
