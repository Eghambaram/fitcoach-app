"use client";

import {
  type Exercise,
  EXERCISE_CATEGORY_LABELS,
  FITNESS_GOAL_LABELS,
  FITNESS_GOALS,
  PROGRAM_WORKOUTS_MAX,
  type ProgramDetail,
  type ProgramExerciseInput,
  programInputSchema,
  WEEKDAY_NAMES,
  WORKOUT_EXERCISES_MAX,
} from "@fitcoach/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  LayoutTemplate,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog, Drawer, Modal } from "@/components/shared/overlays";
import { EmptyState, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { AssignProgramForm } from "./assign-program";

/** An exercise row while editing: the save body plus what the row shows. */
type Row = ProgramExerciseInput & { key: string; label: string; meta: string; timed: boolean };
type Workout = { key: string; name: string; dayNumber: number; notes: string; exercises: Row[] };
type Draft = {
  name: string;
  description: string;
  goal: ProgramDetail["goal"];
  durationWeeks: number;
  workouts: Workout[];
};

const newKey = () => crypto.randomUUID();
const numberOrNull = (value: string) => (value === "" ? null : Number(value));

function toDraft(program: ProgramDetail): Draft {
  return {
    name: program.name,
    description: program.description ?? "",
    goal: program.goal,
    durationWeeks: program.durationWeeks,
    workouts: program.workouts.map((workout) => ({
      key: workout.id,
      name: workout.name,
      dayNumber: workout.dayNumber,
      notes: workout.notes ?? "",
      exercises: workout.exercises.map((item) => ({
        key: item.id,
        label: item.exercise.name,
        meta: EXERCISE_CATEGORY_LABELS[item.exercise.category],
        timed: item.durationSeconds !== null,
        exerciseId: item.exercise.id,
        sets: item.sets,
        repsMin: item.repsMin,
        repsMax: item.repsMax,
        durationSeconds: item.durationSeconds,
        targetLoadKg: item.targetLoadKg,
        restSeconds: item.restSeconds,
        trainerNotes: item.trainerNotes ?? "",
        clientInstructions: item.clientInstructions ?? "",
      })),
    })),
  };
}

function toBody(draft: Draft) {
  return {
    name: draft.name,
    description: draft.description,
    goal: draft.goal,
    durationWeeks: draft.durationWeeks,
    workouts: draft.workouts.map((workout) => ({
      name: workout.name,
      dayNumber: workout.dayNumber,
      notes: workout.notes,
      exercises: workout.exercises.map((row) => ({
        exerciseId: row.exerciseId,
        sets: row.sets,
        repsMin: row.timed ? null : row.repsMin,
        repsMax: row.timed ? null : row.repsMax,
        durationSeconds: row.timed ? row.durationSeconds : null,
        targetLoadKg: row.targetLoadKg,
        restSeconds: row.restSeconds,
        trainerNotes: row.trainerNotes,
        clientInstructions: row.clientInstructions,
      })),
    })),
  };
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/** Search the library and pick an exercise to add (§8.5). */
export function ExercisePicker({ onPick }: { onPick: (exercise: Exercise) => void }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: ["exercise-picker", term],
    queryFn: () =>
      unwrap(browserApi.GET("/v1/exercises", { params: { query: { q: term || undefined } } })),
  });
  return (
    <div className="flex flex-col gap-3">
      <Field label="Search exercises">
        <Input
          type="search"
          value={search}
          autoFocus
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      {query.isPending ? (
        <p role="status" className="py-6 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-danger">
          We couldn&apos;t load the library. Please try again.
        </p>
      ) : query.data.exercises.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No exercises match.</p>
      ) : (
        <ul className="flex max-h-[50vh] flex-col divide-y divide-border overflow-y-auto rounded-control border border-border">
          {query.data.exercises.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => onPick(exercise)}
                className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-charcoal"
              >
                <span className="font-medium">
                  {exercise.name}
                  {exercise.custom ? " · yours" : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {EXERCISE_CATEGORY_LABELS[exercise.category]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link href="/app/exercises?source=custom" className="text-sm underline">
        Missing one? Add it to your library
      </Link>
    </div>
  );
}

function ExerciseRow({
  row,
  index,
  count,
  errors,
  onChange,
  onMove,
  onRemove,
  onDragStart,
  onDrop,
}: {
  row: Row;
  index: number;
  count: number;
  errors: (field: string) => string | undefined;
  onChange: (next: Row) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const [notes, setNotes] = useState(Boolean(row.trainerNotes || row.clientInstructions));
  const set = (patch: Partial<Row>) => onChange({ ...row, ...patch });
  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      className="flex flex-col gap-3 rounded-control border border-border bg-card p-3"
    >
      <div className="flex items-start gap-2">
        <GripVertical
          className="mt-3 size-4 shrink-0 cursor-grab text-muted-foreground"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 pt-2">
          <p className="font-medium">
            {index + 1}. {row.label}
          </p>
          <p className="text-xs text-muted-foreground">{row.meta}</p>
          {errors("exerciseId") ? (
            <p role="alert" className="text-xs text-danger">
              {errors("exerciseId")}
            </p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Move ${row.label} up`}
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
        >
          <ArrowUp aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Move ${row.label} down`}
          disabled={index === count - 1}
          onClick={() => onMove(index + 1)}
        >
          <ArrowDown aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Remove ${row.label}`} onClick={onRemove}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Field label="Sets" error={errors("sets")}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            value={row.sets}
            onChange={(event) => set({ sets: Number(event.target.value) })}
          />
        </Field>
        <Field label="Target">
          <Select
            value={row.timed ? "time" : "reps"}
            onChange={(event) => {
              const timed = event.target.value === "time";
              set({
                timed,
                durationSeconds: timed ? (row.durationSeconds ?? 30) : row.durationSeconds,
                repsMin: timed ? row.repsMin : (row.repsMin ?? 10),
              });
            }}
          >
            <option value="reps">Reps</option>
            <option value="time">Time</option>
          </Select>
        </Field>
        {row.timed ? (
          <Field
            label="Seconds"
            error={errors("durationSeconds")}
            className="col-span-2 sm:col-span-2"
          >
            <Input
              type="number"
              inputMode="numeric"
              min={5}
              value={row.durationSeconds ?? ""}
              onChange={(event) => set({ durationSeconds: numberOrNull(event.target.value) })}
            />
          </Field>
        ) : (
          <>
            <Field label="Reps from" error={errors("repsMin")}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={row.repsMin ?? ""}
                onChange={(event) => set({ repsMin: numberOrNull(event.target.value) })}
              />
            </Field>
            <Field label="Reps to" error={errors("repsMax")}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={row.repsMax ?? ""}
                onChange={(event) => set({ repsMax: numberOrNull(event.target.value) })}
              />
            </Field>
          </>
        )}
        <Field label="Load (kg)" error={errors("targetLoadKg")}>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.25"
            value={row.targetLoadKg ?? ""}
            onChange={(event) => set({ targetLoadKg: numberOrNull(event.target.value) })}
          />
        </Field>
        <Field label="Rest (s)" error={errors("restSeconds")}>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={row.restSeconds ?? ""}
            onChange={(event) => set({ restSeconds: numberOrNull(event.target.value) })}
          />
        </Field>
      </div>
      {notes ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Trainer notes (only you)" error={errors("trainerNotes")}>
            <Input
              maxLength={500}
              value={row.trainerNotes ?? ""}
              onChange={(event) => set({ trainerNotes: event.target.value })}
            />
          </Field>
          <Field label="Instructions for the client" error={errors("clientInstructions")}>
            <Input
              maxLength={500}
              value={row.clientInstructions ?? ""}
              onChange={(event) => set({ clientInstructions: event.target.value })}
            />
          </Field>
        </div>
      ) : (
        <Button variant="ghost" className="self-start" onClick={() => setNotes(true)}>
          Add notes
        </Button>
      )}
    </li>
  );
}

/** Program builder (PROMPT §8.5, `/app/programs/[id]`). Saves the whole program at once. */
export function ProgramBuilder({ initial }: { initial: ProgramDetail }) {
  const router = useRouter();
  const online = useOnline();
  const [program, setProgram] = useState(initial);
  const [draft, setDraft] = useState(() => toDraft(initial));
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [dragging, setDragging] = useState<{ workout: number; index: number } | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(change: (current: Draft) => Draft) {
    setDraft((current) => change(current));
    setDirty(true);
  }
  function editWorkout(index: number, change: (workout: Workout) => Workout) {
    edit((current) => ({
      ...current,
      workouts: current.workouts.map((workout, position) =>
        position === index ? change(workout) : workout,
      ),
    }));
  }

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.PUT("/v1/programs/{id}", {
          params: { path: { id: program.id } },
          body: programInputSchema.parse(toBody(draft)),
        }),
      ),
    onSuccess: (next) => {
      setProgram(next);
      setDraft(toDraft(next));
      setDirty(false);
      setErrors({});
      toast.success("Program saved.");
    },
    onError: (failure) => {
      if (failure instanceof ApiRequestError && failure.body.fieldErrors) {
        setErrors(
          Object.fromEntries(
            Object.entries(failure.body.fieldErrors).map(([path, messages]) => [
              path,
              messages[0] ?? "",
            ]),
          ),
        );
      }
      setProblem(failure.message);
    },
  });

  const copy = useMutation({
    mutationFn: (asTemplate: boolean) =>
      unwrap(
        browserApi.POST("/v1/programs", {
          body: {
            fromProgramId: program.id,
            asTemplate,
            name: asTemplate ? `${program.name} (template)`.slice(0, 80) : undefined,
          },
        }),
      ),
    onSuccess: (next, asTemplate) => {
      toast.success(asTemplate ? "Saved as a template." : "Program duplicated.");
      router.push(`/app/programs/${next.id}`);
    },
    onError: (failure) => toast.error(failure.message),
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      unwrap(
        archived
          ? browserApi.POST("/v1/programs/{id}/archive", { params: { path: { id: program.id } } })
          : browserApi.POST("/v1/programs/{id}/restore", { params: { path: { id: program.id } } }),
      ),
    onSuccess: (next) => {
      setProgram(next);
      toast.success(next.archived ? "Program archived." : "Program restored.");
    },
    onError: (failure) => toast.error(failure.message),
  });

  function submit() {
    setProblem(null);
    const parsed = programInputSchema.safeParse(toBody(draft));
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
        ),
      );
      setProblem("Some details need fixing. They're highlighted below.");
      return;
    }
    save.mutate();
  }

  const err = (path: string) => errors[path];
  const locked = program.archived;
  const usedDays = new Set(draft.workouts.map((workout) => workout.dayNumber));

  return (
    <div className="flex flex-col gap-5 pb-24">
      <Link href="/app/programs" className="self-start text-sm font-medium underline">
        All programs
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">{program.name}</h1>
        {program.isTemplate ? <StatusPill tone="info">Your template</StatusPill> : null}
        {program.archived ? <StatusPill tone="warning">Archived</StatusPill> : null}
        {program.activeAssignments > 0 ? (
          <StatusPill tone="success">
            {program.activeAssignments} client{program.activeAssignments === 1 ? "" : "s"}
          </StatusPill>
        ) : null}
      </div>
      {program.activeAssignments > 0 ? (
        <p className="text-sm text-muted-foreground">
          Clients follow the copy they were assigned. Changes here apply when you assign it again.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="dark"
          disabled={!online || locked || dirty}
          onClick={() => setAssigning(true)}
          title={dirty ? "Save your changes first" : undefined}
        >
          <UserPlus aria-hidden="true" />
          Assign to client
        </Button>
        <Button
          variant="outline"
          disabled={!online || copy.isPending}
          onClick={() => copy.mutate(false)}
        >
          <Copy aria-hidden="true" />
          Duplicate
        </Button>
        {program.isTemplate ? null : (
          <Button
            variant="outline"
            disabled={!online || copy.isPending}
            onClick={() => copy.mutate(true)}
          >
            <LayoutTemplate aria-hidden="true" />
            Save as template
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={!online || archive.isPending}
          onClick={() => archive.mutate(!program.archived)}
        >
          {program.archived ? <RotateCcw aria-hidden="true" /> : <Archive aria-hidden="true" />}
          {program.archived ? "Restore" : "Archive"}
        </Button>
      </div>
      {dirty ? (
        <p role="status" className="text-sm text-warning">
          Unsaved changes. Save before assigning.
        </p>
      ) : null}

      <fieldset disabled={locked} className="flex flex-col gap-5">
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Program name" error={err("name")} required className="sm:col-span-2">
            <Input
              maxLength={80}
              value={draft.name}
              onChange={(event) => edit((current) => ({ ...current, name: event.target.value }))}
            />
          </Field>
          <Field label="Goal" error={err("goal")}>
            <Select
              value={draft.goal ?? ""}
              onChange={(event) =>
                edit((current) => ({
                  ...current,
                  goal: (event.target.value || null) as Draft["goal"],
                }))
              }
            >
              <option value="">No specific goal</option>
              {FITNESS_GOALS.map((goal) => (
                <option key={goal} value={goal}>
                  {FITNESS_GOAL_LABELS[goal]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Duration (weeks)" error={err("durationWeeks")} required>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={52}
              value={draft.durationWeeks}
              onChange={(event) =>
                edit((current) => ({ ...current, durationWeeks: Number(event.target.value) }))
              }
            />
          </Field>
          <Field
            label="Description (optional)"
            error={err("description")}
            className="sm:col-span-2"
          >
            <Textarea
              rows={2}
              maxLength={1000}
              value={draft.description}
              onChange={(event) =>
                edit((current) => ({ ...current, description: event.target.value }))
              }
            />
          </Field>
        </Card>

        {err("workouts") ? (
          <p role="alert" className="text-sm text-danger">
            {err("workouts")}
          </p>
        ) : null}
        <ol className="flex flex-col gap-4">
          {draft.workouts.map((workout, w) => (
            <li key={workout.key}>
              <Card className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <Field
                    label="Workout name"
                    error={err(`workouts.${w}.name`)}
                    className="min-w-48 flex-1"
                  >
                    <Input
                      maxLength={80}
                      value={workout.name}
                      onChange={(event) =>
                        editWorkout(w, (current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Day" error={err(`workouts.${w}.dayNumber`)} className="w-40">
                    <Select
                      value={workout.dayNumber}
                      onChange={(event) =>
                        editWorkout(w, (current) => ({
                          ...current,
                          dayNumber: Number(event.target.value),
                        }))
                      }
                    >
                      {Object.entries(WEEKDAY_NAMES).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${workout.name} up`}
                      disabled={w === 0}
                      onClick={() =>
                        edit((current) => ({
                          ...current,
                          workouts: move(current.workouts, w, w - 1),
                        }))
                      }
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Move ${workout.name} down`}
                      disabled={w === draft.workouts.length - 1}
                      onClick={() =>
                        edit((current) => ({
                          ...current,
                          workouts: move(current.workouts, w, w + 1),
                        }))
                      }
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${workout.name}`}
                      disabled={draft.workouts.length === 1}
                      onClick={() => setRemoving(w)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <Field label="Workout notes (optional)" error={err(`workouts.${w}.notes`)}>
                  <Input
                    maxLength={1000}
                    value={workout.notes}
                    onChange={(event) =>
                      editWorkout(w, (current) => ({ ...current, notes: event.target.value }))
                    }
                  />
                </Field>
                {workout.exercises.length === 0 ? (
                  <EmptyState
                    title="No exercises yet"
                    description="Add exercises from the library."
                  />
                ) : (
                  <ol className="flex flex-col gap-3" aria-label={`${workout.name} exercises`}>
                    {workout.exercises.map((row, index) => (
                      <ExerciseRow
                        key={row.key}
                        row={row}
                        index={index}
                        count={workout.exercises.length}
                        errors={(field) => err(`workouts.${w}.exercises.${index}.${field}`)}
                        onChange={(next) =>
                          editWorkout(w, (current) => ({
                            ...current,
                            exercises: current.exercises.map((item, position) =>
                              position === index ? next : item,
                            ),
                          }))
                        }
                        onMove={(to) =>
                          editWorkout(w, (current) => ({
                            ...current,
                            exercises: move(current.exercises, index, to),
                          }))
                        }
                        onRemove={() =>
                          editWorkout(w, (current) => ({
                            ...current,
                            exercises: current.exercises.filter(
                              (_, position) => position !== index,
                            ),
                          }))
                        }
                        onDragStart={() => setDragging({ workout: w, index })}
                        onDrop={() => {
                          if (dragging && dragging.workout === w) {
                            editWorkout(w, (current) => ({
                              ...current,
                              exercises: move(current.exercises, dragging.index, index),
                            }));
                          }
                          setDragging(null);
                        }}
                      />
                    ))}
                  </ol>
                )}
                <Button
                  variant="outline"
                  className="self-start"
                  disabled={workout.exercises.length >= WORKOUT_EXERCISES_MAX}
                  onClick={() => setPicking(w)}
                >
                  <Plus aria-hidden="true" />
                  Add exercise
                </Button>
              </Card>
            </li>
          ))}
        </ol>
        <Button
          variant="outline"
          className="self-start"
          disabled={draft.workouts.length >= PROGRAM_WORKOUTS_MAX}
          onClick={() =>
            edit((current) => {
              const day = [1, 2, 3, 4, 5, 6, 7].find((value) => !usedDays.has(value)) ?? 1;
              return {
                ...current,
                workouts: [
                  ...current.workouts,
                  {
                    key: newKey(),
                    name: `Workout ${current.workouts.length + 1}`,
                    dayNumber: day,
                    notes: "",
                    exercises: [],
                  },
                ],
              };
            })
          }
        >
          <Plus aria-hidden="true" />
          Add workout
        </Button>
      </fieldset>

      {/* Sticky save bar: always reachable on a phone. */}
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur md:bottom-0 md:pl-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
          {problem ? (
            <p role="alert" className="mr-auto text-sm font-medium text-danger">
              {problem}
            </p>
          ) : null}
          <Button disabled={!online || locked || !dirty} loading={save.isPending} onClick={submit}>
            <Save aria-hidden="true" />
            Save program
          </Button>
        </div>
      </div>

      <Modal
        open={picking !== null}
        onOpenChange={(open) => (open ? null : setPicking(null))}
        title="Add exercise"
      >
        {picking !== null ? (
          <ExercisePicker
            onPick={(exercise) => {
              const target = picking;
              editWorkout(target, (current) => ({
                ...current,
                exercises: [
                  ...current.exercises,
                  {
                    key: newKey(),
                    label: exercise.name,
                    meta: EXERCISE_CATEGORY_LABELS[exercise.category],
                    timed: exercise.category === "cardio" || exercise.category === "mobility",
                    exerciseId: exercise.id,
                    sets: 3,
                    repsMin:
                      exercise.category === "cardio" || exercise.category === "mobility" ? null : 8,
                    repsMax:
                      exercise.category === "cardio" || exercise.category === "mobility"
                        ? null
                        : 12,
                    durationSeconds:
                      exercise.category === "cardio" || exercise.category === "mobility"
                        ? 30
                        : null,
                    targetLoadKg: null,
                    restSeconds: 60,
                    trainerNotes: "",
                    clientInstructions: "",
                  },
                ],
              }));
              setPicking(null);
              toast.success(`${exercise.name} added.`);
            }}
          />
        ) : null}
      </Modal>
      <Drawer
        open={assigning}
        onOpenChange={setAssigning}
        title="Assign to client"
        description={program.name}
      >
        {assigning ? (
          <AssignProgramForm
            program={program}
            onAssigned={(result, clientId) => {
              setAssigning(false);
              toast.success(
                `Assigned. ${result.sessionsPlanned} workout${result.sessionsPlanned === 1 ? "" : "s"} planned for the next 4 weeks.`,
              );
              router.push(`/app/clients/${clientId}?tab=workouts`);
            }}
          />
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? null : setRemoving(null))}
        title="Remove this workout?"
        description={`${removing !== null ? draft.workouts[removing]?.name : ""} and its exercises are removed when you save.`}
        confirmLabel="Remove workout"
        destructive
        onConfirm={() => {
          if (removing !== null) {
            edit((current) => ({
              ...current,
              workouts: current.workouts.filter((_, position) => position !== removing),
            }));
          }
          setRemoving(null);
        }}
      />
      <span className={cn("sr-only")} aria-live="polite">
        {dirty ? "Unsaved changes" : ""}
      </span>
    </div>
  );
}
