"use client";

import {
  FITNESS_GOAL_LABELS,
  type ProgramTemplate,
  type ProgramTemplatesResponse,
  targetLabel,
} from "@fitcoach/shared";
import { CalendarDays, Dumbbell, ListChecks } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Drawer } from "@/components/shared/overlays";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function restLabel(seconds: number | null): string | null {
  if (!seconds) return null;
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min rest` : `${seconds} s rest`;
}

function TemplateDetail({ template }: { template: ProgramTemplate }) {
  return (
    <div className="flex flex-col gap-5">
      {template.description ? <p className="text-sm">{template.description}</p> : null}
      <div className="flex flex-wrap gap-2">
        <StatusPill tone="neutral">{template.daysPerWeek} days a week</StatusPill>
        <StatusPill tone="neutral">{template.durationWeeks} weeks</StatusPill>
        {template.goal ? (
          <StatusPill tone="info">{FITNESS_GOAL_LABELS[template.goal]}</StatusPill>
        ) : null}
      </div>
      <ol className="flex flex-col gap-4">
        {template.workouts.map((workout) => (
          <li key={workout.id}>
            <Card className="flex flex-col gap-3 p-4">
              <div>
                <h3 className="font-semibold">{workout.name}</h3>
                <p className="text-xs text-muted-foreground">Day {workout.dayNumber} of the week</p>
                {workout.notes ? <p className="mt-1 text-sm">{workout.notes}</p> : null}
              </div>
              <ol className="flex flex-col divide-y divide-border">
                {workout.exercises.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <span className="font-medium">{item.exercise.name}</span>
                    <span className="text-muted-foreground">
                      {[`${item.sets} × ${targetLabel(item)}`, restLabel(item.restSeconds)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        Starter templates are generic starting points; adjust exercises, loads and volume to each
        client.
      </p>
    </div>
  );
}

/** Programs (PROMPT §8.5): starter templates now; the builder and assignment arrive in step 3.4. */
export function ProgramsScreen({ data }: { data: ProgramTemplatesResponse }) {
  const [open, setOpen] = useState<ProgramTemplate | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Programs"
        description="Start from a template, built only from exercises in the library."
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/exercises">
              <Dumbbell aria-hidden="true" />
              Exercise library
            </Link>
          </Button>
        }
      />
      <p role="status" className="rounded-card bg-info-soft p-4 text-sm">
        Building your own programs, copying a template and assigning it to a client are coming next.
        For now you can browse the starter templates and the exercise library.
      </p>
      <section aria-labelledby="templates-heading" className="flex flex-col gap-3">
        <h2 id="templates-heading" className="text-lg font-semibold">
          Starter templates
        </h2>
        {data.templates.length === 0 ? (
          <Card>
            <EmptyState icon={ListChecks} title="No templates available" />
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => setOpen(template)}
                  className="flex h-full w-full flex-col gap-2 rounded-card border border-border bg-card p-4 text-left shadow-card hover:border-charcoal focus-visible:outline-2 focus-visible:outline-charcoal"
                >
                  <span className="font-semibold">{template.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays className="size-3.5" aria-hidden="true" />
                    {template.workouts.length} workouts · {template.durationWeeks} weeks
                  </span>
                  {template.description ? (
                    <span className="line-clamp-3 text-sm text-muted-foreground">
                      {template.description}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Drawer
        open={open !== null}
        onOpenChange={(next) => (next ? null : setOpen(null))}
        title={open?.name ?? "Template"}
      >
        {open ? <TemplateDetail template={open} /> : null}
      </Drawer>
    </div>
  );
}
