"use client";

import {
  type CheckIn,
  type CheckInInput,
  checkInInputSchema,
  type ClientCheckInResponse,
  type Feeling,
  FEELING_LABELS,
  FEELINGS,
  type Soreness,
  SORENESS_LABELS,
  SORENESS_LEVELS,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import {
  BatteryLow,
  CheckCircle2,
  ClipboardCheck,
  Frown,
  Laugh,
  type LucideIcon,
  Meh,
  Smile,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { EmptyState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { dayLabel } from "../calendar/dates";

const FEELING_ICONS: Record<Feeling, LucideIcon> = {
  great: Laugh,
  good: Smile,
  okay: Meh,
  tired: BatteryLow,
  poor: Frown,
};

type Errors = Partial<Record<keyof CheckInInput, string>>;

/** A 1–10 slider with its value shown (RatingSlider, §7.2). */
function RatingSlider({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  low: string;
  high: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-lg font-semibold" aria-hidden="true">
          {value}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={10}
        step={1}
        value={value}
        aria-valuetext={`${value} out of 10`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-11 w-full accent-lime-hover"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

/** One choice of a set, as a pill with a label (never colour alone, §7.4). */
function Choice({
  name,
  checked,
  onChange,
  children,
  className,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center justify-center rounded-control border px-3 text-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-charcoal",
        checked ? "border-lime-hover bg-lime/40" : "border-border bg-card hover:bg-muted",
        className,
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {children}
    </label>
  );
}

function CheckInForm({
  initial,
  pending,
  onSubmit,
  serverErrors,
}: {
  initial: CheckIn | null;
  pending: boolean;
  onSubmit: (input: CheckInInput) => void;
  serverErrors: Errors;
}) {
  const online = useOnline();
  const [feeling, setFeeling] = useState<Feeling | null>(initial?.feeling ?? null);
  const [energy, setEnergy] = useState(initial?.energy ?? 5);
  const [sleep, setSleep] = useState(initial?.sleep ?? 5);
  const [soreness, setSoreness] = useState<Soreness | null>(initial?.soreness ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [workoutFeedback, setWorkoutFeedback] = useState(initial?.workoutFeedback ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const shown = { ...serverErrors, ...errors };

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = checkInInputSchema.safeParse({
          feeling,
          energy,
          sleep,
          soreness,
          notes,
          workoutFeedback,
        });
        if (!parsed.success) {
          const next: Errors = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0] as keyof CheckInInput;
            next[key] ??= issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSubmit(parsed.data);
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">How are you feeling today?</legend>
        <div className="grid grid-cols-5 gap-2">
          {FEELINGS.map((value) => {
            const Icon = FEELING_ICONS[value];
            return (
              <Choice
                key={value}
                name="feeling"
                checked={feeling === value}
                onChange={() => setFeeling(value)}
                className="min-h-16 flex-col gap-1 px-1"
              >
                <Icon className="size-6" aria-hidden="true" />
                <span className="text-xs">{FEELING_LABELS[value]}</span>
              </Choice>
            );
          })}
        </div>
        {shown.feeling ? (
          <p role="alert" className="text-sm text-danger">
            {shown.feeling}
          </p>
        ) : null}
      </fieldset>

      <RatingSlider
        label="Energy level"
        value={energy}
        onChange={setEnergy}
        low="Low"
        high="High"
      />
      <RatingSlider
        label="Sleep quality"
        value={sleep}
        onChange={setSleep}
        low="Poor"
        high="Great"
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Any muscle soreness?</legend>
        <div className="grid grid-cols-4 gap-2">
          {SORENESS_LEVELS.map((value) => (
            <Choice
              key={value}
              name="soreness"
              checked={soreness === value}
              onChange={() => setSoreness(value)}
            >
              {SORENESS_LABELS[value]}
            </Choice>
          ))}
        </div>
        {shown.soreness ? (
          <p role="alert" className="text-sm text-danger">
            {shown.soreness}
          </p>
        ) : null}
      </fieldset>

      <Field label="Notes (optional)" error={shown.notes}>
        <Textarea
          rows={3}
          maxLength={1000}
          placeholder="How do you feel today?"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <Field label="How was your last workout? (optional)" error={shown.workoutFeedback}>
        <Textarea
          rows={2}
          maxLength={1000}
          value={workoutFeedback}
          onChange={(event) => setWorkoutFeedback(event.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" loading={pending} disabled={!online}>
        {initial ? "Update check-in" : "Submit check-in"}
      </Button>
    </form>
  );
}

function Summary({ checkIn }: { checkIn: CheckIn }) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-sm">
      {(
        [
          ["Feeling", FEELING_LABELS[checkIn.feeling]],
          ["Soreness", SORENESS_LABELS[checkIn.soreness]],
          ["Energy", `${checkIn.energy}/10`],
          ["Sleep", `${checkIn.sleep}/10`],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="rounded-control bg-muted px-3 py-2">
          <dt className="text-xs font-medium text-foreground">{label}</dt>
          <dd className="font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** `/client/check-in` (PROMPT §8.7, client board 6): under a minute, editable until midnight. */
export function ClientCheckIn({ initial }: { initial: ClientCheckInResponse }) {
  const [data, setData] = useState(initial);
  const [editing, setEditing] = useState(initial.todays === null);
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const submit = useMutation({
    mutationFn: (body: CheckInInput) => unwrap(browserApi.PUT("/v1/client/check-in", { body })),
    onSuccess: (next) => {
      setData(next);
      setEditing(false);
      setServerErrors({});
    },
    onError: (failure) => {
      if (failure instanceof ApiRequestError && failure.body.fieldErrors) {
        setServerErrors(
          Object.fromEntries(
            Object.entries(failure.body.fieldErrors).map(([key, messages]) => [key, messages[0]]),
          ),
        );
      } else {
        toast.error(failure.message);
      }
    },
  });

  if (!data.enabled) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-bold tracking-tight">Daily check-in</h1>
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            title="Check-ins are off"
            description={`${data.trainerName} hasn't turned on check-ins for you.`}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Daily check-in</h1>
        <p className="text-sm text-muted-foreground">{dayLabel(data.today, "long")}</p>
      </div>

      {data.todays && !editing ? (
        <Card className="flex flex-col gap-4 p-5">
          <p role="status" className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="size-6 text-success" aria-hidden="true" />
            Sent to {data.trainerName}
          </p>
          <Summary checkIn={data.todays} />
          {data.todays.reply ? (
            <p className="rounded-control bg-lime/30 p-3 text-sm">
              <span className="font-semibold">{data.trainerName}:</span> {data.todays.reply}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Self-reported. You can change it until midnight.
          </p>
          <Button variant="outline" className="self-start" onClick={() => setEditing(true)}>
            Edit today&apos;s check-in
          </Button>
        </Card>
      ) : (
        <Card className="p-5">
          {data.due === false && data.todays === null ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Today isn&apos;t one of your check-in days, but you can still send one.
            </p>
          ) : null}
          <CheckInForm
            initial={data.todays}
            pending={submit.isPending}
            onSubmit={(input) => submit.mutate(input)}
            serverErrors={serverErrors}
          />
        </Card>
      )}

      {data.recent.length > 0 ? (
        <section aria-labelledby="recent-check-ins" className="flex flex-col gap-2">
          <h2 id="recent-check-ins" className="text-sm font-semibold text-muted-foreground">
            Last two weeks
          </h2>
          <ul className="flex flex-col gap-2">
            {data.recent.map((item) => (
              <li key={item.id} className="rounded-card border border-border bg-card p-4 text-sm">
                <p className="font-medium">
                  {dayLabel(item.localDate, "long")} · {FEELING_LABELS[item.feeling]} · energy{" "}
                  {item.energy}/10 · sleep {item.sleep}/10
                </p>
                {item.reply ? (
                  <p className="mt-1">
                    <span className="font-semibold">{data.trainerName}:</span> {item.reply}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
