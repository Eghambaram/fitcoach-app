"use client";

import type { DashboardSummary, FirstRunStep } from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Circle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { browserApi, unwrap } from "@/lib/api/browser";

const STEPS: Record<FirstRunStep, { label: string; href: string }> = {
  public_page: { label: "Publish your public page", href: "/app/settings/public-page" },
  first_person: { label: "Add your first lead or client", href: "/app/leads" },
  program: { label: "Assign a program (start from a template)", href: "/app/programs" },
  invite: { label: "Invite a client via WhatsApp", href: "/app/clients" },
};

/** First-run checklist (§8.1): ticks itself from real data; shown until done or dismissed. */
export function ChecklistCard({ checklist }: { checklist: DashboardSummary["checklist"] }) {
  const router = useRouter();
  const dismiss = useMutation({
    mutationFn: () => unwrap(browserApi.POST("/v1/dashboard/checklist/dismiss")),
    onSuccess: () => router.refresh(),
    onError: (failure) => toast.error(failure.message),
  });
  const done = checklist.steps.filter((step) => step.done).length;
  return (
    <Card className="flex flex-col gap-4 border-lime-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Get set up</h2>
          <p className="text-sm text-muted-foreground">
            {done} of {checklist.steps.length} done
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Hide the setup checklist"
          loading={dismiss.isPending}
          onClick={() => dismiss.mutate()}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <ol className="flex flex-col gap-1">
        {checklist.steps.map((step, index) => (
          <li key={step.key}>
            <Link
              href={STEPS[step.key].href}
              className="flex min-h-11 items-center gap-3 rounded-control px-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-charcoal"
            >
              {step.done ? (
                <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
              ) : (
                <Circle className="size-5 text-muted-foreground" aria-hidden="true" />
              )}
              <span className={step.done ? "text-muted-foreground line-through" : "font-medium"}>
                {index + 1}. {STEPS[step.key].label}
              </span>
              <span className="sr-only">{step.done ? "(done)" : "(to do)"}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
