"use client";

import type { ClientMeResponse } from "@fitcoach/shared";
import { CalendarDays, ChevronRight, CircleHelp, Dumbbell, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { InstallCard } from "../pwa/install-card";
import { ContactTrainerButtons, TrainerAvatar } from "./client-display";
import { useClientSignOut } from "./client-shell";

const LINKS = [
  { href: "/client/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/client/profile", label: "Profile & settings", icon: UserRound },
  { href: "/client/workouts", label: "My workouts", icon: Dumbbell },
] as const;

/** More (PROMPT §9, client board 12 adjusted): contact trainer, profile, help, sign out. */
export function ClientMore({ me }: { me: ClientMeResponse }) {
  const signOut = useClientSignOut();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">More</h1>
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center gap-3">
          <TrainerAvatar name={me.trainer.displayName} url={me.trainer.avatarUrl} size={56} />
          <div>
            <p className="text-sm text-muted-foreground">Your trainer</p>
            <p className="font-semibold">{me.trainer.displayName}</p>
            <p className="text-sm text-muted-foreground">{me.workspace.name}</p>
          </div>
        </div>
        <ContactTrainerButtons phone={me.trainer.phoneE164} name={me.trainer.displayName} />
      </Card>
      <InstallCard />
      <ul className="divide-y divide-border rounded-card border border-border bg-card">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-14 items-center gap-3 px-4 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-charcoal"
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
            className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-sm font-medium text-danger hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-charcoal"
          >
            <LogOut className="size-5" aria-hidden="true" />
            Sign out
          </button>
        </li>
      </ul>
      <Card className="flex flex-col gap-2 p-5 text-sm">
        <h2 className="flex items-center gap-2 font-semibold">
          <CircleHelp className="size-5" aria-hidden="true" />
          Help
        </h2>
        <p className="text-muted-foreground">
          Questions about your workouts, sessions or package? Contact {me.trainer.displayName}{" "}
          above. Signed out? Use the link your trainer sent you, or sign in with a code sent to your
          email.
        </p>
        <p className="text-muted-foreground">
          <Link
            href="/privacy"
            className="font-semibold text-foreground underline underline-offset-2"
          >
            Privacy policy
          </Link>{" "}
          ·{" "}
          <Link
            href="/terms"
            className="font-semibold text-foreground underline underline-offset-2"
          >
            Terms of use
          </Link>
        </p>
      </Card>
    </div>
  );
}
