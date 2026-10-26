"use client";

import {
  DIFFICULTY_LABELS,
  EQUIPMENT,
  EQUIPMENT_LABELS,
  type Exercise,
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABELS,
  type ExerciseListResponse,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
} from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Dumbbell, ExternalLink, Pencil, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FilterBar } from "@/components/shared/data-list";
import { useOnline } from "@/components/shared/offline-banner";
import { Drawer } from "@/components/shared/overlays";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { useUrlQuery } from "@/lib/use-url-query";
import { ExerciseForm } from "./exercise-form";
import { EXERCISE_PARAMS } from "./exercise-params";

function MuscleChips({ exercise }: { exercise: Pick<Exercise, "muscleGroups"> }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Muscle groups">
      {exercise.muscleGroups.map((muscle) => (
        <li key={muscle}>
          <StatusPill tone="neutral">{MUSCLE_GROUP_LABELS[muscle]}</StatusPill>
        </li>
      ))}
    </ul>
  );
}

/** One exercise: details, safety notes, substitutions; edit/archive for the trainer's own. */
function ExerciseDetail({
  id,
  onOpen,
  onEdit,
  onChanged,
}: {
  id: string;
  onOpen: (id: string) => void;
  onEdit: (exercise: Exercise) => void;
  onChanged: () => void;
}) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["exercise", id],
    queryFn: () => unwrap(browserApi.GET("/v1/exercises/{id}", { params: { path: { id } } })),
  });
  const toggle = useMutation({
    mutationFn: (archive: boolean) =>
      unwrap(
        archive
          ? browserApi.POST("/v1/exercises/{id}/archive", { params: { path: { id } } })
          : browserApi.POST("/v1/exercises/{id}/restore", { params: { path: { id } } }),
      ),
    onSuccess: (next) => {
      queryClient.setQueryData(["exercise", id], next);
      toast.success(next.archived ? "Exercise archived." : "Exercise restored.");
      onChanged();
    },
    onError: (failure) => toast.error(failure.message),
  });

  if (query.isPending) {
    return (
      <p role="status" className="py-12 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState description="We couldn't load this exercise. Please try again." />;
  }
  const exercise = query.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <StatusPill tone="info">{EXERCISE_CATEGORY_LABELS[exercise.category]}</StatusPill>
        <StatusPill tone="neutral">{DIFFICULTY_LABELS[exercise.difficulty]}</StatusPill>
        {exercise.custom ? <StatusPill tone="lime">Yours</StatusPill> : null}
        {exercise.archived ? <StatusPill tone="warning">Archived</StatusPill> : null}
      </div>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Muscle groups</h3>
        <MuscleChips exercise={exercise} />
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Equipment</h3>
        <p className="text-sm">
          {exercise.equipment.map((item) => EQUIPMENT_LABELS[item]).join(", ")}
        </p>
      </section>
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">How to do it</h3>
        <p className="text-sm whitespace-pre-line">
          {exercise.instructions ?? "No instructions yet."}
        </p>
      </section>
      {exercise.safetyNotes ? (
        <section className="flex flex-col gap-1 rounded-control bg-warning-soft p-3">
          <h3 className="text-sm font-semibold">Safety notes</h3>
          <p className="text-sm whitespace-pre-line">{exercise.safetyNotes}</p>
        </section>
      ) : null}
      {exercise.mediaUrl ? (
        <a
          href={exercise.mediaUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          Watch the demo (opens another site)
        </a>
      ) : null}
      {exercise.substitutions.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Alternatives</h3>
          <ul className="flex flex-wrap gap-2">
            {exercise.substitutions.map((sub) => (
              <li key={sub.id}>
                <Button variant="outline" onClick={() => onOpen(sub.id)}>
                  {sub.name}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {exercise.custom ? (
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {exercise.archived ? null : (
            <Button variant="outline" disabled={!online} onClick={() => onEdit(exercise)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={!online}
            loading={toggle.isPending}
            onClick={() => toggle.mutate(!exercise.archived)}
          >
            {exercise.archived ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />}
            {exercise.archived ? "Restore" : "Archive"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Part of the FitCoach library, so it can&apos;t be edited. Add your own version if you
          coach it differently.
        </p>
      )}
    </div>
  );
}

/** Exercise library (PROMPT §8.5): search, filters, details; add your own exercises. */
export function ExercisesScreen({ list }: { list: ExerciseListResponse }) {
  const router = useRouter();
  const params = useSearchParams();
  const online = useOnline();
  const { update, pending } = useUrlQuery();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exercise | "new" | null>(null);
  const source = params.get("source") ?? "all";
  const archived = params.get("archived") === "true";

  useEffect(() => {
    if ((params.get("q") ?? "") === search.trim()) return;
    const timer = setTimeout(() => update({ q: search.trim() || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `update` reads the latest params on each call
  }, [search]);

  const filtered = EXERCISE_PARAMS.some((name) => name !== "source" && params.get(name));
  const refresh = () => router.refresh();
  // Same query as the drawer body, so an alternative opened from the drawer gets its own title.
  const opened = useQuery({
    queryKey: ["exercise", open],
    queryFn: () =>
      unwrap(browserApi.GET("/v1/exercises/{id}", { params: { path: { id: open ?? "" } } })),
    enabled: open !== null,
  });

  return (
    <div className="flex flex-col gap-5">
      <Link href="/app/programs" className="self-start text-sm font-medium underline">
        Programs
      </Link>
      <PageHeader
        title="Exercise library"
        description={`${list.totals.library} library exercises · ${list.totals.custom} of your own`}
        actions={
          <Button disabled={!online} onClick={() => setEditing("new")}>
            <Plus aria-hidden="true" />
            Add exercise
          </Button>
        }
      />
      <FilterBar
        tabs={[
          { value: "all", label: "All", count: list.totals.library + list.totals.custom },
          { value: "library", label: "Library", count: list.totals.library },
          { value: "custom", label: "Yours", count: list.totals.custom },
        ]}
        activeTab={source}
        onTabChange={(value) => update({ source: value === "all" ? null : value })}
        search={search}
        onSearchChange={setSearch}
        searchLabel="Search exercises by name"
      >
        <Select
          aria-label="Muscle group"
          value={params.get("muscle") ?? ""}
          onChange={(event) => update({ muscle: event.target.value })}
          className="sm:w-40"
        >
          <option value="">All muscles</option>
          {MUSCLE_GROUPS.map((muscle) => (
            <option key={muscle} value={muscle}>
              {MUSCLE_GROUP_LABELS[muscle]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Equipment"
          value={params.get("equipment") ?? ""}
          onChange={(event) => update({ equipment: event.target.value })}
          className="sm:w-44"
        >
          <option value="">All equipment</option>
          {EQUIPMENT.map((item) => (
            <option key={item} value={item}>
              {EQUIPMENT_LABELS[item]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Category"
          value={params.get("category") ?? ""}
          onChange={(event) => update({ category: event.target.value })}
          className="sm:w-48"
        >
          <option value="">All categories</option>
          {EXERCISE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {EXERCISE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>
      </FilterBar>
      {source === "custom" ? (
        <label className="flex min-h-11 items-center gap-2 self-start text-sm">
          <input
            type="checkbox"
            className="size-4 accent-charcoal"
            checked={archived}
            onChange={(event) => update({ archived: event.target.checked ? "true" : null })}
          />
          Show archived
        </label>
      ) : null}

      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity" : undefined}>
        {list.exercises.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title={
              filtered
                ? "No exercises match"
                : source === "custom"
                  ? archived
                    ? "No archived exercises"
                    : "No exercises of your own yet"
                  : "No exercises"
            }
            description={
              filtered
                ? "Try another search or filter."
                : source === "custom"
                  ? "Add the exercises you coach that aren't in the library."
                  : undefined
            }
            action={
              source === "custom" && !filtered && !archived ? (
                <Button disabled={!online} onClick={() => setEditing("new")}>
                  Add exercise
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <p className="mb-2 text-sm text-muted-foreground" role="status">
              {list.exercises.length} exercise{list.exercises.length === 1 ? "" : "s"}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.exercises.map((exercise) => (
                <li key={exercise.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(exercise.id)}
                    className="flex h-full w-full flex-col gap-2 rounded-card border border-border bg-card p-4 text-left shadow-card hover:border-charcoal focus-visible:outline-2 focus-visible:outline-charcoal"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{exercise.name}</span>
                      {exercise.custom ? <StatusPill tone="lime">Yours</StatusPill> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {EXERCISE_CATEGORY_LABELS[exercise.category]} ·{" "}
                      {exercise.equipment.map((item) => EQUIPMENT_LABELS[item]).join(", ")}
                    </span>
                    <MuscleChips exercise={exercise} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <Drawer
        open={open !== null}
        onOpenChange={(next) => (next ? null : setOpen(null))}
        title={
          opened.data?.name ??
          list.exercises.find((exercise) => exercise.id === open)?.name ??
          "Exercise"
        }
      >
        {open ? (
          <ExerciseDetail
            key={open}
            id={open}
            onOpen={setOpen}
            onEdit={(exercise) => {
              setOpen(null);
              setEditing(exercise);
            }}
            onChanged={refresh}
          />
        ) : null}
      </Drawer>
      <Drawer
        open={editing !== null}
        onOpenChange={(next) => (next ? null : setEditing(null))}
        title={editing === "new" ? "Add exercise" : "Edit exercise"}
      >
        {editing ? (
          <ExerciseForm
            exercise={editing === "new" ? null : editing}
            onSaved={(saved) => {
              setEditing(null);
              toast.success(editing === "new" ? "Exercise added." : "Exercise saved.");
              refresh();
              setOpen(saved.id);
            }}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
