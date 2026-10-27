"use client";

import {
  type Exercise,
  type PutWorkoutSetRequest,
  type WorkoutDetail,
  type WorkoutExercise,
  type WorkoutSessionStatus,
  WORKOUT_SESSION_STATUS_LABELS,
  WORKOUT_SET_MAX,
} from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Dumbbell,
  Minus,
  Plus,
  Repeat,
  Timer,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Modal } from "@/components/shared/overlays";
import { ErrorState, type PillTone, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { attendanceMessage } from "../calendar/appointment-drawer";
import { dayLabel } from "../calendar/dates";
import { clientPackagesKey } from "../packages/packages-tab";
import { ExercisePicker } from "../programs/program-builder";
import type { WorkoutApi } from "./workout-api";

const STATUS_TONES: Record<WorkoutSessionStatus, PillTone> = {
  planned: "info",
  in_progress: "warning",
  completed: "success",
  skipped: "neutral",
};

type Values = Pick<PutWorkoutSetRequest, "reps" | "loadKg" | "durationSeconds">;

function seconds(value: number): string {
  if (value < 60) return `${value}s`;
  const rest = value % 60;
  return `${Math.floor(value / 60)}:${String(rest).padStart(2, "0")}`;
}

const kg = (value: number) =>
  `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, "")} kg`;

/** "3 × 8–12 reps × 20 kg", "3 × 45s". */
function targetLabel(item: WorkoutExercise, withSets = true): string {
  const effort =
    item.durationSeconds !== null
      ? seconds(item.durationSeconds)
      : item.repsMax !== null && item.repsMax !== item.repsMin
        ? `${item.repsMin}–${item.repsMax} reps`
        : `${item.repsMin} reps`;
  const load = item.targetLoadKg !== null ? ` × ${kg(item.targetLoadKg)}` : "";
  return `${withSets ? `${item.sets} × ` : ""}${effort}${load}`;
}

function setLabel(values: Values): string {
  const effort =
    values.durationSeconds !== null ? seconds(values.durationSeconds) : `${values.reps ?? 0} reps`;
  return values.loadKg !== null ? `${effort} × ${kg(values.loadKg)}` : effort;
}

/** Starting values for a set: what was logged, else the previous set, else the target. */
function valuesFor(item: WorkoutExercise, setNumber: number): Values {
  const logged = item.logged.find((set) => set.setNumber === setNumber);
  const previous = item.logged.filter((set) => set.setNumber < setNumber).at(-1);
  const source = logged ?? previous;
  if (source) {
    return { reps: source.reps, loadKg: source.loadKg, durationSeconds: source.durationSeconds };
  }
  return item.durationSeconds !== null
    ? { reps: null, loadKg: item.targetLoadKg, durationSeconds: item.durationSeconds }
    : { reps: item.repsMax ?? item.repsMin, loadKg: item.targetLoadKg, durationSeconds: null };
}

/** The first set that isn't completed yet (or the last one when all are). */
function nextSet(item: WorkoutExercise): number {
  const rows = Math.max(item.sets, item.logged.at(-1)?.setNumber ?? 0);
  for (let number = 1; number <= rows; number += 1) {
    if (!item.logged.some((set) => set.setNumber === number && set.completed)) return number;
  }
  return rows;
}

function ExerciseThumb({ item, large = false }: { item: WorkoutExercise; large?: boolean }) {
  const size = large ? "aspect-video w-full" : "size-12 shrink-0";
  if (!item.exercise.mediaUrl) {
    return (
      <div
        className={cn("flex items-center justify-center rounded-control bg-muted", size)}
        aria-hidden="true"
      >
        <Dumbbell className={cn("text-muted-foreground", large ? "size-10" : "size-5")} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- licensed external link chosen by the trainer; no optimisation or caching wanted
    <img
      src={item.exercise.mediaUrl}
      alt={large ? `${item.exercise.name} demonstration` : ""}
      className={cn("rounded-control bg-muted object-cover", size)}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}

function ProgressBar({ summary }: { summary: WorkoutDetail["summary"] }) {
  const { exercisesDone, exercisesTotal } = summary;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span id="workout-progress" className="font-medium">
          {exercisesDone} of {exercisesTotal} exercises completed
        </span>
        <span className="text-muted-foreground">
          {summary.setsCompleted} of {summary.setsPlanned} sets
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby="workout-progress"
        aria-valuemin={0}
        aria-valuemax={exercisesTotal}
        aria-valuenow={exercisesDone}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-lime motion-safe:transition-[width]"
          style={{ width: `${exercisesTotal ? (exercisesDone / exercisesTotal) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

/** The workout's exercises (the "Upper Body Strength" board): ticks, targets and progress. */
function ExerciseList({
  workout,
  current,
  onSelect,
}: {
  workout: WorkoutDetail;
  current?: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <ol className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
      {workout.exercises.map((item, index) => {
        const body = (
          <>
            <ExerciseThumb item={item} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{item.exercise.name}</span>
              <span className="text-xs text-muted-foreground">
                {targetLabel(item)}
                {item.substitutedFor ? ` · instead of ${item.substitutedFor.name}` : ""}
                {item.added ? " · added" : ""}
              </span>
            </span>
            {item.done ? (
              <span className="flex items-center gap-1 text-xs font-semibold text-success">
                <Check className="size-4" aria-hidden="true" /> Done
              </span>
            ) : item.logged.some((set) => set.completed) ? (
              <span className="text-xs text-muted-foreground">
                {item.logged.filter((set) => set.completed).length}/{item.sets} sets
              </span>
            ) : null}
          </>
        );
        return (
          <li key={item.id ?? item.position}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={current === index ? "step" : undefined}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-charcoal",
                  current === index && "bg-lime/25",
                )}
              >
                {body}
              </button>
            ) : (
              <div className="flex min-h-14 items-center gap-3 px-3 py-2 text-sm">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepperTile({
  label,
  value,
  unit,
  step,
  max,
  decimals = false,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null;
  unit?: string;
  step: number;
  max: number;
  decimals?: boolean;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(0, Math.round(next * 4) / 4));
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-card p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={disabled || value === null || value <= 0}
          onClick={() => onChange(clamp((value ?? 0) - step))}
        >
          <Minus aria-hidden="true" />
        </Button>
        <Input
          type="number"
          inputMode={decimals ? "decimal" : "numeric"}
          aria-label={label}
          min={0}
          max={max}
          step={decimals ? 0.25 : 1}
          value={value ?? ""}
          placeholder="—"
          disabled={disabled}
          onChange={(event) =>
            onChange(event.target.value === "" ? null : clamp(Number(event.target.value)))
          }
          className="h-11 min-w-0 flex-1 px-1 text-center text-xl font-semibold"
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={disabled || (value ?? 0) >= max}
          onClick={() => onChange(clamp((value ?? 0) + step))}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      {unit ? <span className="text-center text-xs text-muted-foreground">{unit}</span> : null}
    </div>
  );
}

/** Rest countdown. Runs on this device only; nothing is saved. */
function RestTile({
  restSeconds,
  endsAt,
  onStart,
  onStop,
}: {
  restSeconds: number | null;
  endsAt: number | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [endsAt]);
  const left = endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
  useEffect(() => {
    if (left === 0) {
      onStop();
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(200);
    }
  }, [left, onStop]);
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-card p-3">
      <span className="text-xs text-muted-foreground">Rest</span>
      <div className="flex min-h-11 items-center justify-between gap-2">
        <span role="timer" aria-label="Rest remaining" className="text-xl font-semibold">
          {left !== null ? seconds(left) : restSeconds !== null ? seconds(restSeconds) : "—"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label={left !== null ? "Stop rest timer" : "Start rest timer"}
          disabled={left === null && !restSeconds}
          onClick={left !== null ? onStop : onStart}
        >
          <Timer aria-hidden="true" />
        </Button>
      </div>
      <span className="text-center text-xs text-muted-foreground">
        {left !== null ? "resting" : "sec"}
      </span>
    </div>
  );
}

function SummaryTiles({ workout }: { workout: WorkoutDetail }) {
  const { summary } = workout;
  const tiles: [string, string][] = [
    ["Exercises", `${summary.exercisesDone} of ${summary.exercisesTotal}`],
    ["Sets", `${summary.setsCompleted} of ${summary.setsPlanned}`],
    ["Volume", summary.volumeKg > 0 ? kg(summary.volumeKg) : "—"],
    ["Duration", summary.durationMinutes !== null ? `${summary.durationMinutes} min` : "—"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map(([label, value]) => (
        <div key={label} className="rounded-control border border-border bg-card p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-lg font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Live workout (PROMPT §8.5, "Live Workout" and "Upper Body Strength" boards). Every set is saved as
 * it is completed (`PUT /workout-sets/:id` with an id made on this device), so a refresh restores
 * everything from the API. Saving is disabled while offline.
 */
export function LiveWorkout({
  initial,
  api,
  back,
  audience = "trainer",
}: {
  initial: WorkoutDetail;
  api: WorkoutApi;
  back: { href: string; label: string };
  /** The client app hides trainer-only parts (skip, swap, add, attendance). */
  audience?: "trainer" | "client";
}) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const key = api.key;
  const query = useQuery({ queryKey: key, queryFn: () => api.get(), initialData: initial });
  const workout = query.data;
  const store = (next: WorkoutDetail) => queryClient.setQueryData(key, next);

  const [skipping, setSkipping] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const canStart = audience === "client" || workout.client.active;
  const start = useMutation({
    mutationFn: () => api.start(),
    onSuccess: (next) => {
      store(next);
      if (next.appointment) toast.success("Workout started. Linked to today's session.");
    },
    onError: (failure) => toast.error(failure.message),
  });
  const skip = useMutation({
    mutationFn: () => {
      if (!api.skip) throw new Error("Skipping isn't available here.");
      return api.skip(skipReason);
    },
    onSuccess: (next) => {
      store(next);
      setSkipping(false);
      toast.success("Workout skipped.");
    },
    onError: (failure) => toast.error(failure.message),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link
          href={back.href}
          className="flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> {back.label}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{workout.name}</h1>
            <p className="text-sm text-muted-foreground">
              {workout.program.name} · {dayLabel(workout.scheduledOn, "long")}
            </p>
          </div>
          <StatusPill tone={STATUS_TONES[workout.status]}>
            {WORKOUT_SESSION_STATUS_LABELS[workout.status]}
          </StatusPill>
        </div>
        {workout.status !== "planned" && workout.exercises.length > 0 ? (
          <ProgressBar summary={workout.summary} />
        ) : null}
      </div>

      {workout.status === "planned" ? (
        <div className="flex flex-col gap-4">
          {workout.program.notes || workout.program.instructions ? (
            <Card className="flex flex-col gap-1 p-4 text-sm">
              {workout.program.notes ? (
                <p className="whitespace-pre-line">{workout.program.notes}</p>
              ) : null}
              {workout.program.instructions ? (
                <p className="whitespace-pre-line text-muted-foreground">
                  {workout.program.instructions}
                </p>
              ) : null}
            </Card>
          ) : null}
          <ExerciseList workout={workout} />
          {canStart ? null : (
            <p className="text-sm text-muted-foreground">
              {workout.client.fullName} isn&apos;t an active client, so this workout can&apos;t
              start.
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="lg"
              loading={start.isPending}
              disabled={!online || !canStart}
              onClick={() => start.mutate()}
            >
              Start workout
            </Button>
            {api.skip ? (
              <Button
                variant="outline"
                size="lg"
                disabled={!online}
                onClick={() => setSkipping(true)}
              >
                Skip workout
              </Button>
            ) : null}
          </div>
        </div>
      ) : workout.status === "in_progress" ? (
        <InProgress
          workout={workout}
          api={api}
          audience={audience}
          online={online}
          store={store}
          onSkip={api.skip ? () => setSkipping(true) : undefined}
        />
      ) : (
        <Finished workout={workout} api={api} audience={audience} online={online} />
      )}

      <Modal
        open={skipping}
        onOpenChange={setSkipping}
        title="Skip this workout?"
        description="It's marked as skipped in their history. Anything already logged stays."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            skip.mutate();
          }}
        >
          <Field label="Reason (optional)">
            <Input
              value={skipReason}
              maxLength={200}
              onChange={(event) => setSkipReason(event.target.value)}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" type="button" onClick={() => setSkipping(false)}>
              Cancel
            </Button>
            <Button variant="dark" type="submit" loading={skip.isPending} disabled={!online}>
              Skip workout
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function InProgress({
  workout,
  api,
  audience,
  online,
  store,
  onSkip,
}: {
  workout: WorkoutDetail;
  api: WorkoutApi;
  audience: "trainer" | "client";
  online: boolean;
  store: (next: WorkoutDetail) => void;
  onSkip?: () => void;
}) {
  const firstOpen = workout.exercises.findIndex((item) => !item.done);
  const [index, setIndex] = useState(firstOpen >= 0 ? firstOpen : 0);
  const item = workout.exercises[index] ?? workout.exercises[0];
  const [setNumber, setSetNumber] = useState(() => (item ? nextSet(item) : 1));
  const [values, setValues] = useState<Values>(() =>
    item ? valuesFor(item, setNumber) : { reps: null, loadKg: null, durationSeconds: null },
  );
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [view, setView] = useState<"current" | "all">("current");
  const [swapping, setSwapping] = useState(false);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [finishKey, setFinishKey] = useState(() => crypto.randomUUID());
  /** One id per (exercise, set), kept across retries so a repeated save is the same set. */
  const setIds = useRef(new Map<string, string>());

  function select(nextIndex: number, list = workout.exercises) {
    const next = list[nextIndex];
    if (!next) return;
    setIndex(nextIndex);
    const number = nextSet(next);
    setSetNumber(number);
    setValues(valuesFor(next, number));
    setView("current");
  }
  function pickSet(number: number) {
    if (!item) return;
    setSetNumber(number);
    setValues(valuesFor(item, number));
  }

  const save = useMutation({
    mutationFn: ({ number, completed }: { number: number; completed: boolean }) => {
      if (!item?.id) throw new Error("This exercise hasn't started.");
      const slot = `${item.id}:${number}`;
      const id =
        item.logged.find((set) => set.setNumber === number)?.id ??
        setIds.current.get(slot) ??
        crypto.randomUUID();
      setIds.current.set(slot, id);
      return api.putSet(id, {
        sessionExerciseId: item.id,
        setNumber: number,
        ...values,
        rpe: item.logged.find((set) => set.setNumber === number)?.rpe ?? null,
        completed,
      });
    },
    onSuccess: (next, { number, completed }) => {
      store(next);
      const updated = next.exercises[index];
      if (!updated || !completed) return;
      if (item?.restSeconds) setRestEndsAt(Date.now() + item.restSeconds * 1000);
      const following = nextSet(updated);
      if (following !== number) {
        setSetNumber(following);
        setValues(valuesFor(updated, following));
      }
      if (updated.done && !item?.done) toast.success(`${updated.exercise.name} done.`);
    },
    onError: (failure) => toast.error(failure.message),
  });
  const swap = useMutation({
    mutationFn: (exerciseId: string) => {
      if (!api.substitute || !item?.id) throw new Error("Swapping isn't available here.");
      return api.substitute(item.id, exerciseId);
    },
    onSuccess: (next) => {
      store(next);
      setSwapping(false);
    },
    onError: (failure) => toast.error(failure.message),
  });
  const add = useMutation({
    mutationFn: (exercise: Exercise) => {
      const timed = exercise.category === "cardio" || exercise.category === "mobility";
      if (!api.addExercise) throw new Error("Adding exercises isn't available here.");
      return api.addExercise({
        exerciseId: exercise.id,
        sets: 3,
        repsMin: timed ? null : 10,
        repsMax: null,
        durationSeconds: timed ? 30 : null,
        targetLoadKg: null,
        restSeconds: 60,
      });
    },
    onSuccess: (next) => {
      store(next);
      setAdding(false);
      select(next.exercises.length - 1, next.exercises);
    },
    onError: (failure) => toast.error(failure.message),
  });
  const finish = useMutation({
    mutationFn: () => api.finish(feedback, finishKey),
    onSuccess: (next) => {
      store(next);
      setFinishing(false);
      toast.success("Workout finished.");
    },
    onError: (failure) => toast.error(failure.message),
  });

  if (!item) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-sm text-muted-foreground">This workout has no exercises.</p>
        {api.addExercise ? (
          <Button variant="outline" disabled={!online} onClick={() => setAdding(true)}>
            Add exercise
          </Button>
        ) : null}
      </Card>
    );
  }

  const rows = Math.max(item.sets, item.logged.at(-1)?.setNumber ?? 0, setNumber);
  const current = item.logged.find((set) => set.setNumber === setNumber);
  const timed = item.durationSeconds !== null;
  const busy = save.isPending || !online;

  const exercisePanel = (
    <Card className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            Exercise {index + 1} of {workout.exercises.length}
          </p>
          <h2 className="text-xl font-semibold">{item.exercise.name}</h2>
          <p className="text-sm text-muted-foreground">
            Target {targetLabel(item)}
            {item.substitutedFor ? ` · instead of ${item.substitutedFor.name}` : ""}
          </p>
        </div>
        {api.substitute ? (
          <Button variant="outline" disabled={!online} onClick={() => setSwapping(true)}>
            <Repeat aria-hidden="true" /> Swap
          </Button>
        ) : null}
      </div>
      <ExerciseThumb item={item} large />
      {item.clientInstructions || item.trainerNotes ? (
        <div className="flex flex-col gap-1 text-sm">
          {item.clientInstructions ? <p>{item.clientInstructions}</p> : null}
          {item.trainerNotes ? (
            <p className="text-muted-foreground">Your notes: {item.trainerNotes}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {timed ? (
          <StepperTile
            label="Time"
            unit="sec"
            value={values.durationSeconds}
            step={5}
            max={7200}
            disabled={busy}
            onChange={(durationSeconds) => setValues((v) => ({ ...v, durationSeconds }))}
          />
        ) : (
          <StepperTile
            label="Reps"
            value={values.reps}
            step={1}
            max={200}
            disabled={busy}
            onChange={(reps) => setValues((v) => ({ ...v, reps }))}
          />
        )}
        <StepperTile
          label="Weight"
          unit="kg"
          value={values.loadKg}
          step={2.5}
          max={1000}
          decimals
          disabled={busy}
          onChange={(loadKg) => setValues((v) => ({ ...v, loadKg }))}
        />
        <RestTile
          restSeconds={item.restSeconds}
          endsAt={restEndsAt}
          onStart={() =>
            item.restSeconds ? setRestEndsAt(Date.now() + item.restSeconds * 1000) : null
          }
          onStop={() => setRestEndsAt(null)}
        />
      </div>

      <ol className="flex flex-col gap-2" aria-label="Sets">
        {Array.from({ length: rows }, (_, i) => i + 1).map((number) => {
          const logged = item.logged.find((set) => set.setNumber === number);
          const selected = number === setNumber;
          return (
            <li key={number}>
              <button
                type="button"
                onClick={() => pickSet(number)}
                aria-current={selected ? "step" : undefined}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-control border px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-charcoal",
                  selected
                    ? "border-lime-hover bg-lime/25"
                    : "border-border bg-card hover:bg-muted",
                )}
              >
                {logged?.completed ? (
                  <Check className="size-5 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="size-5 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="font-semibold">Set {number}</span>
                <span className="text-muted-foreground">
                  {logged ? setLabel(logged) : targetLabel(item, false)}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {logged?.completed ? "Done" : selected ? "Current" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          loading={save.isPending}
          disabled={!online}
          onClick={() => save.mutate({ number: setNumber, completed: true })}
        >
          {current?.completed ? `Update set ${setNumber}` : `Complete set ${setNumber}`}
        </Button>
        <div className="flex flex-wrap justify-between gap-2">
          {current?.completed ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => save.mutate({ number: setNumber, completed: false })}
            >
              Mark set {setNumber} not done
            </Button>
          ) : (
            <span />
          )}
          {rows < WORKOUT_SET_MAX && item.logged.some((set) => set.setNumber === rows) ? (
            <Button variant="ghost" disabled={busy} onClick={() => pickSet(rows + 1)}>
              <Plus aria-hidden="true" /> Add set
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={index === 0} onClick={() => select(index - 1)}>
          <ChevronLeft aria-hidden="true" /> Previous
        </Button>
        <Button
          variant={item.done ? "dark" : "outline"}
          disabled={index === workout.exercises.length - 1}
          onClick={() => select(index + 1)}
        >
          Next exercise <ChevronRight aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );

  const listPanel = (
    <div className="flex flex-col gap-3">
      <ExerciseList workout={workout} current={index} onSelect={select} />
      {api.addExercise ? (
        <Button variant="outline" disabled={!online} onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" /> Add exercise
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Show"
        className="flex w-fit gap-1 rounded-control border border-border bg-card p-1 lg:hidden"
      >
        {(
          [
            ["current", "Current exercise"],
            ["all", "All exercises"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            onClick={() => setView(value)}
            className={cn(
              "min-h-9 rounded-[10px] px-3 text-sm font-medium",
              view === value ? "bg-charcoal text-white" : "text-foreground hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <div className={cn(view === "all" ? "block" : "hidden", "lg:block")}>{listPanel}</div>
        <div className={cn(view === "current" ? "block" : "hidden", "lg:block")}>
          {exercisePanel}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="dark"
          size="lg"
          disabled={!online}
          onClick={() => {
            setFinishKey(crypto.randomUUID());
            setFinishing(true);
          }}
        >
          Finish workout
        </Button>
        {onSkip ? (
          <Button variant="ghost" size="lg" disabled={!online} onClick={onSkip}>
            Skip workout
          </Button>
        ) : null}
      </div>

      <Modal
        open={swapping}
        onOpenChange={setSwapping}
        title={`Swap ${item.exercise.name}`}
        description="Sets already logged stay with this exercise."
      >
        <div className="flex flex-col gap-4">
          {item.substitutions.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Suggested</h3>
              <div className="flex flex-wrap gap-2">
                {item.substitutions.map((option) => (
                  <Button
                    key={option.id}
                    variant="outline"
                    disabled={swap.isPending || !online}
                    onClick={() => swap.mutate(option.id)}
                  >
                    {option.name}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {item.substitutedFor ? (
            <Button
              variant="ghost"
              disabled={swap.isPending || !online}
              onClick={() => swap.mutate(item.substitutedFor?.id ?? "")}
            >
              Back to {item.substitutedFor.name}
            </Button>
          ) : null}
          <ExercisePicker onPick={(exercise) => swap.mutate(exercise.id)} />
        </div>
      </Modal>

      <Modal
        open={adding}
        onOpenChange={setAdding}
        title="Add an exercise"
        description="It's added to this workout only, with 3 sets you can adjust while logging."
      >
        <ExercisePicker onPick={(exercise) => (add.isPending ? null : add.mutate(exercise))} />
      </Modal>

      <Modal open={finishing} onOpenChange={setFinishing} title="Finish workout?">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            finish.mutate();
          }}
        >
          <SummaryTiles workout={workout} />
          {workout.summary.setsCompleted === 0 ? (
            <p role="alert" className="text-sm text-danger">
              {audience === "client"
                ? "No sets are completed yet. Complete a set first."
                : "No sets are completed yet. Complete a set, or skip the workout instead."}
            </p>
          ) : null}
          <Field
            label={audience === "client" ? "How did it go? (optional)" : "Feedback (optional)"}
            hint={
              audience === "client"
                ? "Shared with your trainer."
                : "Saved in their workout history."
            }
          >
            <Textarea
              value={feedback}
              maxLength={1000}
              rows={3}
              onChange={(event) => setFeedback(event.target.value)}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" type="button" onClick={() => setFinishing(false)}>
              Keep going
            </Button>
            <Button
              type="submit"
              loading={finish.isPending}
              disabled={!online || workout.summary.setsCompleted === 0}
            >
              Finish workout
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/** Summary after finishing (or a skipped workout), with "Mark attended" for the linked session. */
function Finished({
  workout,
  api,
  audience,
  online,
}: {
  workout: WorkoutDetail;
  api: WorkoutApi;
  audience: "trainer" | "client";
  online: boolean;
}) {
  const queryClient = useQueryClient();
  const attend = useMutation({
    mutationFn: (appointmentId: string) => {
      if (!api.markAttended) throw new Error("Attendance is marked by your trainer.");
      return api.markAttended(appointmentId);
    },
    onSuccess: async (next) => {
      toast.success(attendanceMessage(next));
      await queryClient.invalidateQueries({ queryKey: api.key });
      await queryClient.invalidateQueries({ queryKey: clientPackagesKey(workout.client.id) });
    },
    onError: (failure) => toast.error(failure.message),
  });
  const appointment = workout.appointment;
  const open =
    appointment && (appointment.status === "scheduled" || appointment.status === "confirmed");

  return (
    <div className="flex flex-col gap-4">
      {workout.status === "completed" ? (
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-lg font-semibold">Workout summary</h2>
          <SummaryTiles workout={workout} />
          {workout.feedback ? (
            <p className="text-sm whitespace-pre-line">
              <span className="font-medium">Feedback:</span> {workout.feedback}
            </p>
          ) : null}
          {workout.clientFeedback ? (
            <p className="text-sm whitespace-pre-line">
              <span className="font-medium">
                {audience === "client" ? "Your feedback:" : "Client's feedback:"}
              </span>{" "}
              {workout.clientFeedback}
            </p>
          ) : null}
          {api.markAttended && appointment && open && workout.status === "completed" ? (
            <div className="flex flex-col gap-2 rounded-control border border-border p-4">
              <p className="text-sm">
                This workout was part of today&apos;s session.{" "}
                {appointment.started
                  ? "Mark it attended to record it (and use a package session if they have one)."
                  : "You can mark it attended once the session's start time has passed."}
              </p>
              <Button
                className="w-fit"
                loading={attend.isPending}
                disabled={!online || !appointment.started}
                onClick={() => attend.mutate(appointment.id)}
              >
                Mark attended
              </Button>
            </div>
          ) : appointment?.status === "completed" ? (
            <p className="text-sm text-muted-foreground">
              <Check className="mr-1 inline size-4 text-success" aria-hidden="true" />
              Session marked attended.
            </p>
          ) : null}
        </Card>
      ) : (
        <Card className="p-5 text-sm">
          <p>This workout was skipped{workout.skipReason ? `: ${workout.skipReason}` : "."}</p>
        </Card>
      )}
      {workout.exercises.length > 0 ? <ExerciseList workout={workout} /> : null}
      {workout.exercises.some((item) => item.logged.length > 0) ? (
        <section aria-labelledby="logged-sets" className="flex flex-col gap-2">
          <h2 id="logged-sets" className="font-semibold">
            Logged sets
          </h2>
          <ul className="flex flex-col gap-2">
            {workout.exercises
              .filter((item) => item.logged.length > 0)
              .map((item) => (
                <li
                  key={item.id ?? item.position}
                  className="rounded-control border border-border bg-card p-3 text-sm"
                >
                  <p className="font-medium">{item.exercise.name}</p>
                  <p className="text-muted-foreground">
                    {item.logged
                      .filter((set) => set.completed)
                      .map((set) => setLabel(set))
                      .join(" · ") || "No completed sets"}
                  </p>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function WorkoutError({ missing }: { missing: boolean }) {
  return (
    <Card>
      <ErrorState
        title={missing ? "Workout not found" : undefined}
        description={
          missing
            ? "It may belong to another workspace, or the link is wrong."
            : "We couldn't load this workout. Please try again."
        }
        action={
          <Button variant="outline" asChild>
            <Link href="/app/clients">All clients</Link>
          </Button>
        }
      />
    </Card>
  );
}
