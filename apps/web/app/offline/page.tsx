import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import { Logo } from "@/components/brand/logo";
import { RetryButton } from "@/features/pwa/retry-button";

export const metadata: Metadata = { title: "You're offline" };
/** Precached by the service worker, so it must not depend on the API or cookies. */
export const dynamic = "force-static";

/** Shown by the service worker when a page can't load without a connection (PROMPT §14). */
export default function OfflinePage() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-4 text-center"
    >
      <Logo />
      <span className="flex size-14 items-center justify-center rounded-full bg-muted">
        <CloudOff className="size-7 text-muted-foreground" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-bold text-charcoal">You&apos;re offline</h1>
      <p className="text-muted-foreground">
        FitCoach needs a connection to load this page. Nothing you saved earlier is lost — check
        your internet and try again.
      </p>
      <RetryButton />
    </main>
  );
}
