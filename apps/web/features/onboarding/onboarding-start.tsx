"use client";

import { type OnboardingDraftsResponse, ONBOARDING_STEPS } from "@fitcoach/shared";
import { FileClock, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDay } from "../leads/lead-display";
import { OnboardingWizard } from "./onboarding-wizard";

/** `/app/clients/new` without a draft: resume one in progress, or start a new client. */
export function OnboardingStart({ drafts, units }: OnboardingDraftsResponse) {
  const [starting, setStarting] = useState(drafts.length === 0);
  if (starting) {
    return (
      <OnboardingWizard
        initial={{ id: null, clientId: null, step: 1, data: {}, updatedAt: null, units }}
      />
    );
  }
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileClock className="size-5" aria-hidden="true" />
          Drafts in progress
        </h2>
        <ul className="divide-y divide-border">
          {drafts.map((draft) => (
            <li key={draft.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium">{draft.fullName ?? "Unnamed client"}</p>
                <p className="text-xs text-muted-foreground">
                  Step {draft.step} of {ONBOARDING_STEPS.length}: {ONBOARDING_STEPS[draft.step - 1]}{" "}
                  · saved {formatDay(draft.updatedAt).toLowerCase()}
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link href={`/app/clients/new?draft=${draft.id}`}>
                  Continue<span className="sr-only"> {draft.fullName ?? "draft"}</span>
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Button className="self-start" onClick={() => setStarting(true)}>
        <UserPlus aria-hidden="true" />
        Start a new client
      </Button>
    </div>
  );
}
