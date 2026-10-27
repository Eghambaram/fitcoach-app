"use client";

import type { ClientMeResponse } from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, ClipboardCheck, Dumbbell, House, LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { browserApi, unwrap } from "@/lib/api/browser";
import { cn } from "@/lib/utils";

/**
 * Client navigation (PROMPT §9). Check-in shows only when the trainer has check-ins on for this
 * client; Progress joins with step 4.4. Only screens that work are listed (CLAUDE.md rule 22).
 */
const NAV = [
  { href: "/client/home", label: "Home", icon: House },
  { href: "/client/workouts", label: "Workouts", icon: Dumbbell },
  { href: "/client/check-in", label: "Check-in", icon: ClipboardCheck, feature: "checkIns" },
  { href: "/client/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/client/more", label: "More", icon: Menu },
] as const;

export function useClientSignOut() {
  const router = useRouter();
  return useMutation({
    mutationFn: () => unwrap(browserApi.POST("/v1/auth/logout")),
    onSuccess: () => {
      router.replace("/client/login");
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });
}

/** The client portal frame: calmer than the trainer app, one primary action per screen. */
export function ClientShell({ me, children }: { me: ClientMeResponse; children: ReactNode }) {
  const pathname = usePathname();
  const signOut = useClientSignOut();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const nav = NAV.filter((item) => !("feature" in item) || me.features[item.feature]);
  return (
    <div className="flex min-h-dvh flex-col bg-background pb-20 sm:pb-0">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <Link href="/client/home" className="rounded-control">
          <Logo />
        </Link>
        <nav aria-label="Client app" className="hidden gap-1 sm:flex">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium",
                active(href) ? "bg-lime text-lime-foreground" : "hover:bg-muted",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <Button
          variant="ghost"
          loading={signOut.isPending}
          onClick={() => signOut.mutate()}
          aria-label="Sign out"
          className="hidden sm:inline-flex"
        >
          <LogOut aria-hidden="true" />
          Sign out
        </Button>
      </header>
      {me.workspace.readOnly ? (
        <div
          role="status"
          className="bg-warning-soft px-4 py-2 text-center text-sm font-medium text-warning"
        >
          {me.trainer.displayName}&apos;s account is paused, so changes can&apos;t be saved right
          now.
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
      <nav
        aria-label="Client app"
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-card pb-safe sm:hidden",
          nav.length === 5 ? "grid-cols-5" : "grid-cols-4",
        )}
      >
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium",
              active(href) ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-12 items-center justify-center rounded-full",
                active(href) && "bg-lime text-lime-foreground",
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
            </span>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
