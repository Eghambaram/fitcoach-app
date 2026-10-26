"use client";

import {
  FITNESS_GOAL_LABELS,
  type ProgramListResponse,
  type ProgramSummary,
  type ProgramTemplate,
  type ProgramTemplatesResponse,
  targetLabel,
  WEEKDAY_NAMES,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Dumbbell, ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Drawer } from "@/components/shared/overlays";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { browserApi, unwrap } from "@/lib/api/browser";

function restLabel(seconds: number | null): string | null {
  if (!seconds) return null;
  return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min rest` : `${seconds} s rest`;
}

/** "Start from template" (or a blank program): creates your copy and opens the builder. */
export function useCreateProgram() {
  const router = useRouter();
  return useMutation({
    mutationFn: (fromProgramId?: string) =>
      unwrap(browserApi.POST("/v1/programs", { body: fromProgramId ? { fromProgramId } : {} })),
    onSuccess: (program) => {
      toast.success("Your copy is ready to edit.");
      router.push(`/app/programs/${program.id}`);
    },
    onError: (failure) => toast.error(failure.message),
  });
}

/** A starter template, read-only: its workouts with sets, reps or time and rest. */
export function TemplateDetail({ template }: { template: ProgramTemplate }) {
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
                <p className="text-xs text-muted-foreground">{WEEKDAY_NAMES[workout.dayNumber]}</p>
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

function ProgramCard({ program }: { program: ProgramSummary }) {
  return (
    <Link
      href={`/app/programs/${program.id}`}
      className="flex h-full flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-card hover:border-charcoal focus-visible:outline-2 focus-visible:outline-charcoal"
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{program.name}</span>
        {program.activeAssignments > 0 ? (
          <StatusPill tone="success">
            {program.activeAssignments} client{program.activeAssignments === 1 ? "" : "s"}
          </StatusPill>
        ) : null}
      </span>
      <span className="text-xs text-muted-foreground">
        {program.daysPerWeek} day{program.daysPerWeek === 1 ? "" : "s"} a week ·{" "}
        {program.durationWeeks} weeks
        {program.goal ? ` · ${FITNESS_GOAL_LABELS[program.goal]}` : ""}
      </span>
    </Link>
  );
}

/** Programs (PROMPT §8.5): yours, your templates and the starter templates. */
export function ProgramsScreen({
  mine,
  archived,
  templates,
}: {
  mine: ProgramListResponse;
  archived: ProgramListResponse;
  templates: ProgramTemplatesResponse;
}) {
  const online = useOnline();
  const create = useCreateProgram();
  const [open, setOpen] = useState<ProgramTemplate | null>(null);
  const programs = mine.programs.filter((program) => !program.isTemplate);
  const ownTemplates = mine.programs.filter((program) => program.isTemplate);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Programs"
        description="Start from a template, adjust it, then assign it to a client."
        actions={
          <>
            <Button
              disabled={!online}
              loading={create.isPending && create.variables === undefined}
              onClick={() => create.mutate(undefined)}
            >
              <Plus aria-hidden="true" />
              New program
            </Button>
            <Button variant="outline" asChild>
              <Link href="/app/exercises">
                <Dumbbell aria-hidden="true" />
                Exercise library
              </Link>
            </Button>
          </>
        }
      />

      <section aria-labelledby="mine-heading" className="flex flex-col gap-3">
        <h2 id="mine-heading" className="text-lg font-semibold">
          Your programs
        </h2>
        {programs.length === 0 ? (
          <Card>
            <EmptyState
              icon={ListChecks}
              title="No programs yet"
              description="Use a starter template below; you get your own copy to edit."
            />
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map((program) => (
              <li key={program.id}>
                <ProgramCard program={program} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {ownTemplates.length > 0 ? (
        <section aria-labelledby="own-templates-heading" className="flex flex-col gap-3">
          <h2 id="own-templates-heading" className="text-lg font-semibold">
            Your templates
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ownTemplates.map((program) => (
              <li key={program.id}>
                <ProgramCard program={program} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="templates-heading" className="flex flex-col gap-3">
        <h2 id="templates-heading" className="text-lg font-semibold">
          Starter templates
        </h2>
        {templates.templates.length === 0 ? (
          <Card>
            <EmptyState icon={ListChecks} title="No templates available" />
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.templates.map((template) => (
              <li key={template.id}>
                <Card className="flex h-full flex-col gap-2 p-4">
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
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Button
                      variant="dark"
                      disabled={!online || create.isPending}
                      loading={create.isPending && create.variables === template.id}
                      onClick={() => create.mutate(template.id)}
                      aria-label={`Use template ${template.name}`}
                    >
                      Use template
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setOpen(template)}
                      aria-label={`Preview ${template.name}`}
                    >
                      Preview
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {archived.programs.length > 0 ? (
        <details className="rounded-card border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Archived ({archived.programs.length})
          </summary>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {archived.programs.map((program) => (
              <li key={program.id}>
                <ProgramCard program={program} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Drawer
        open={open !== null}
        onOpenChange={(next) => (next ? null : setOpen(null))}
        title={open?.name ?? "Template"}
        footer={
          open ? (
            <Button
              className="w-full"
              disabled={!online || create.isPending}
              loading={create.isPending}
              onClick={() => create.mutate(open.id)}
            >
              Use template
            </Button>
          ) : undefined
        }
      >
        {open ? <TemplateDetail template={open} /> : null}
      </Drawer>
    </div>
  );
}

/** A starter template opened by its link: read-only, with "Use template". */
export function TemplateView({ template }: { template: ProgramTemplate }) {
  const online = useOnline();
  const create = useCreateProgram();
  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/programs" className="self-start text-sm font-medium underline">
        All programs
      </Link>
      <PageHeader
        title={template.name}
        description="A FitCoach starter template. Use it to get your own copy to edit and assign."
        actions={
          <Button
            disabled={!online}
            loading={create.isPending}
            onClick={() => create.mutate(template.id)}
          >
            Use template
          </Button>
        }
      />
      <TemplateDetail template={template} />
    </div>
  );
}
