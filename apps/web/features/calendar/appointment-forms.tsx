"use client";

import {
  type Appointment,
  type AppointmentDetail,
  cancelAppointmentRequestSchema,
  createAppointmentRequestSchema,
  SERIES_MAX_OCCURRENCES,
  type SeriesPreviewResponse,
  seriesRequestSchema,
  updateAppointmentRequestSchema,
  WEEKDAY_LABELS,
  WEEKDAYS,
} from "@fitcoach/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { z } from "zod";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { dayLabel, timeLabel } from "./dates";

type Errors = Record<string, string>;

/** First message per field from the shared schema, or from the API's fieldErrors. */
function issues(error: z.ZodError): Errors {
  const out: Errors = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "_")] ??= issue.message;
  return out;
}
function apiErrors(failure: Error): Errors {
  if (!(failure instanceof ApiRequestError) || !failure.body.fieldErrors) return {};
  return Object.fromEntries(
    Object.entries(failure.body.fieldErrors).map(([key, messages]) => [key, messages[0] ?? ""]),
  );
}

function Problem({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-sm font-medium text-danger">
      {message}
    </p>
  ) : null;
}

const DURATIONS = [30, 45, 60, 75, 90, 120];

function ClientPicker({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const options = useQuery({
    queryKey: ["client-options"],
    queryFn: () => unwrap(browserApi.GET("/v1/clients/options")),
  });
  if (options.data && options.data.clients.length === 0) {
    return (
      <p className="rounded-control bg-muted p-3 text-sm">
        No clients yet. Convert a lead or{" "}
        <Link href="/app/clients/new" className="font-semibold underline">
          add a client
        </Link>{" "}
        first.
      </p>
    );
  }
  return (
    <Field label="Client" error={error} required>
      <Select
        value={value}
        disabled={options.isPending}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{options.isPending ? "Loading clients…" : "Choose a client"}</option>
        {options.data?.clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.fullName}
            {client.status === "onboarding_draft" ? " (onboarding)" : ""}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Where the session happens: a place or a video link (Book Trial Session board). */
function WhereFields({
  online,
  setOnline,
  location,
  setLocation,
  meetingUrl,
  setMeetingUrl,
  errors,
}: {
  online: boolean;
  setOnline: (online: boolean) => void;
  location: string;
  setLocation: (value: string) => void;
  meetingUrl: string;
  setMeetingUrl: (value: string) => void;
  errors: Errors;
}) {
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Session type</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            [false, "In person", "At a gym or location"],
            [true, "Online", "Video call"],
          ].map(([value, title, detail]) => (
            <label
              key={String(value)}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-2 rounded-control border p-3 text-sm",
                online === value ? "border-charcoal bg-muted" : "border-border bg-card",
              )}
            >
              <input
                type="radio"
                name="where"
                className="mt-0.5 size-4 accent-charcoal"
                checked={online === value}
                onChange={() => setOnline(value as boolean)}
              />
              <span>
                <span className="block font-medium">{title as string}</span>
                <span className="block text-xs text-muted-foreground">{detail as string}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {online ? (
        <Field label="Meeting link (optional)" error={errors.meetingUrl}>
          <Input
            type="url"
            inputMode="url"
            maxLength={300}
            value={meetingUrl}
            onChange={(event) => setMeetingUrl(event.target.value)}
          />
        </Field>
      ) : (
        <Field label="Location (optional)" error={errors.location}>
          <Input
            maxLength={120}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
        </Field>
      )}
    </>
  );
}

function TimeFields({
  date,
  setDate,
  startTime,
  setStartTime,
  durationMin,
  setDurationMin,
  errors,
}: {
  date: string;
  setDate: (value: string) => void;
  startTime: string;
  setStartTime: (value: string) => void;
  durationMin: number;
  setDurationMin: (value: number) => void;
  errors: Errors;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Field label="Date" error={errors.date} required className="col-span-2 sm:col-span-1">
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </Field>
      <Field label="Start time" error={errors.startTime} required>
        <Input
          type="time"
          step={300}
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
        />
      </Field>
      <Field label="Length" error={errors.durationMin} required>
        <Select
          value={durationMin}
          onChange={(event) => setDurationMin(Number(event.target.value))}
        >
          {[...new Set([...DURATIONS, durationMin])]
            .sort((a, b) => a - b)
            .map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
        </Select>
      </Field>
    </div>
  );
}

/** Book one session for a client, or a trial / consultation for a lead. */
export function AppointmentForm({
  leadId,
  clientId: presetClientId,
  defaultDate,
  onSaved,
}: {
  leadId?: string;
  /** Book for this client (from their profile): no picker. */
  clientId?: string;
  defaultDate: string;
  onSaved: (appointment: AppointmentDetail) => void;
}) {
  const online = useOnline();
  const [clientId, setClientId] = useState(presetClientId ?? "");
  const [kind, setKind] = useState<"session" | "consultation" | "trial">(
    leadId ? "trial" : "session",
  );
  const [isOnline, setOnline] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("07:00");
  const [durationMin, setDurationMin] = useState(60);
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: z.infer<typeof createAppointmentRequestSchema>) =>
      unwrap(browserApi.POST("/v1/appointments", { body })),
    onSuccess: onSaved,
    onError: (failure) => {
      setErrors(apiErrors(failure));
      setProblem(failure.message);
    },
  });

  function submit() {
    setProblem(null);
    const parsed = createAppointmentRequestSchema.safeParse({
      ...(leadId ? { leadId } : { clientId: clientId || undefined }),
      kind: kind === "session" && isOnline ? "online_session" : kind,
      date,
      startTime,
      durationMin,
      location: isOnline ? "" : location,
      meetingUrl: isOnline ? meetingUrl : "",
      notes,
    });
    if (!parsed.success) {
      setErrors(issues(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <div className="flex flex-col gap-4">
      {leadId || presetClientId ? null : (
        <ClientPicker value={clientId} onChange={setClientId} error={errors.clientId} />
      )}
      <Field label="What" error={errors.kind}>
        <Select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          {leadId ? (
            <option value="trial">Trial session</option>
          ) : (
            <option value="session">Training session</option>
          )}
          <option value="consultation">Consultation</option>
        </Select>
      </Field>
      <TimeFields
        {...{ date, setDate, startTime, setStartTime, durationMin, setDurationMin, errors }}
      />
      <WhereFields
        {...{
          online: isOnline,
          setOnline,
          location,
          setLocation,
          meetingUrl,
          setMeetingUrl,
          errors,
        }}
      />
      <Field label="Notes (optional)" hint="Only you can see these." error={errors.notes}>
        <Textarea
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <Problem message={problem} />
      <Button onClick={submit} loading={save.isPending} disabled={!online || save.isSuccess}>
        {leadId ? "Book trial session" : "Book session"}
      </Button>
    </div>
  );
}

/** Reschedule or edit; a recurring session can apply to this and the following ones. */
export function RescheduleForm({
  appointment,
  onSaved,
}: {
  appointment: Appointment;
  onSaved: (appointment: AppointmentDetail) => void;
}) {
  const online = useOnline();
  const [date, setDate] = useState(appointment.date);
  const [startTime, setStartTime] = useState(appointment.startTime);
  const [durationMin, setDurationMin] = useState(appointment.durationMin);
  const [isOnline, setOnline] = useState(
    appointment.meetingUrl !== null || appointment.kind === "online_session",
  );
  const [location, setLocation] = useState(appointment.location ?? "");
  const [meetingUrl, setMeetingUrl] = useState(appointment.meetingUrl ?? "");
  const [scope, setScope] = useState<"this" | "following">("this");
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: z.infer<typeof updateAppointmentRequestSchema>) =>
      unwrap(
        browserApi.PATCH("/v1/appointments/{id}", {
          params: { path: { id: appointment.id } },
          body,
        }),
      ),
    onSuccess: onSaved,
    onError: (failure) => {
      setErrors(apiErrors(failure));
      setProblem(failure.message);
    },
  });

  function submit() {
    setProblem(null);
    const parsed = updateAppointmentRequestSchema.safeParse({
      date,
      startTime,
      durationMin,
      location: isOnline ? "" : location,
      meetingUrl: isOnline ? meetingUrl : "",
      scope,
    });
    if (!parsed.success) {
      setErrors(issues(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  return (
    <div className="flex flex-col gap-4">
      <TimeFields
        {...{ date, setDate, startTime, setStartTime, durationMin, setDurationMin, errors }}
      />
      <WhereFields
        {...{
          online: isOnline,
          setOnline,
          location,
          setLocation,
          meetingUrl,
          setMeetingUrl,
          errors,
        }}
      />
      {appointment.seriesId ? (
        <ScopeChoice scope={scope} setScope={setScope} verb="Change" />
      ) : null}
      <Problem message={problem} />
      <Button variant="dark" onClick={submit} loading={save.isPending} disabled={!online}>
        Save changes
      </Button>
    </div>
  );
}

function ScopeChoice({
  scope,
  setScope,
  verb,
}: {
  scope: "this" | "following";
  setScope: (scope: "this" | "following") => void;
  verb: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1 rounded-control border border-border p-3 text-sm">
      <legend className="px-1 font-medium">This is a recurring session</legend>
      {(
        [
          ["this", `${verb} only this session`],
          ["following", `${verb} this and all following sessions`],
        ] as const
      ).map(([value, label]) => (
        <label key={value} className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="scope"
            className="size-4 accent-charcoal"
            checked={scope === value}
            onChange={() => setScope(value)}
          />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function CancelForm({
  appointment,
  onSaved,
}: {
  appointment: Appointment;
  onSaved: (appointment: AppointmentDetail) => void;
}) {
  const online = useOnline();
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"this" | "following">("this");
  const [error, setError] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: (body: z.infer<typeof cancelAppointmentRequestSchema>) =>
      unwrap(
        browserApi.POST("/v1/appointments/{id}/cancel", {
          params: { path: { id: appointment.id } },
          body,
        }),
      ),
    onSuccess: onSaved,
    onError: (failure) => setError(failure.message),
  });
  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Reason"
        error={error}
        required
        hint="Cancelling inside your late-cancel window is marked as a late cancel."
      >
        <Input maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      {appointment.seriesId ? (
        <ScopeChoice scope={scope} setScope={setScope} verb="Cancel" />
      ) : null}
      <Button
        variant="danger"
        loading={save.isPending}
        disabled={!online}
        onClick={() => {
          const parsed = cancelAppointmentRequestSchema.safeParse({ reason, scope });
          if (!parsed.success) setError(issues(parsed.error).reason);
          else save.mutate(parsed.data);
        }}
      >
        Cancel session
      </Button>
    </div>
  );
}

/** Recurring series (§8.6): pattern → "Check dates" lists every occurrence and its conflicts. */
export function SeriesForm({
  defaultDate,
  onSaved,
}: {
  defaultDate: string;
  onSaved: (created: number) => void;
}) {
  const online = useOnline();
  const [clientId, setClientId] = useState("");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startTime, setStartTime] = useState("07:00");
  const [durationMin, setDurationMin] = useState(60);
  const [startsOn, setStartsOn] = useState(defaultDate);
  const [endBy, setEndBy] = useState<"count" | "date">("count");
  const [count, setCount] = useState("24");
  const [endsOn, setEndsOn] = useState("");
  const [isOnline, setOnline] = useState(false);
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [skip, setSkip] = useState<string[]>([]);
  const [preview, setPreview] = useState<SeriesPreviewResponse | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);

  function body() {
    return seriesRequestSchema.safeParse({
      clientId: clientId || undefined,
      kind: isOnline ? "online_session" : "session",
      weekdays: [...weekdays].sort(),
      startTime,
      durationMin,
      startsOn,
      ...(endBy === "count"
        ? { occurrenceCount: Number(count) || undefined }
        : { endsOn: endsOn || undefined }),
      location: isOnline ? "" : location,
      meetingUrl: isOnline ? meetingUrl : "",
      skipDates: skip,
    });
  }

  const check = useMutation({
    mutationFn: (request: z.infer<typeof seriesRequestSchema>) =>
      unwrap(browserApi.POST("/v1/appointments/series/preview", { body: request })),
    onSuccess: (result) => {
      setPreview(result);
      // Conflicting dates are skipped unless the trainer moves the other appointment first.
      setSkip(result.occurrences.filter((o) => o.conflict).map((o) => o.date));
    },
    onError: (failure) => {
      setErrors(apiErrors(failure));
      setProblem(failure.message);
    },
  });
  const create = useMutation({
    mutationFn: (request: z.infer<typeof seriesRequestSchema>) =>
      unwrap(browserApi.POST("/v1/appointments/series", { body: request })),
    onSuccess: (result) => onSaved(result.created),
    onError: (failure) => setProblem(failure.message),
  });

  function run(action: typeof check | typeof create) {
    setProblem(null);
    const parsed = body();
    if (!parsed.success) {
      setErrors(issues(parsed.error));
      setPreview(null);
      return;
    }
    setErrors({});
    action.mutate(parsed.data);
  }

  const changePattern =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPreview(null);
    };
  const toCreate = preview ? preview.occurrences.filter((o) => !skip.includes(o.date)).length : 0;

  return (
    <div className="flex flex-col gap-4">
      <ClientPicker
        value={clientId}
        onChange={changePattern(setClientId)}
        error={errors.clientId}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          Days{" "}
          <span className="text-danger" aria-hidden="true">
            *
          </span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((weekday) => (
            <label
              key={weekday}
              className={cn(
                "flex min-h-11 min-w-12 cursor-pointer items-center justify-center rounded-full border px-3 text-sm font-medium",
                weekdays.includes(weekday)
                  ? "border-charcoal bg-lime text-lime-foreground"
                  : "border-border bg-card",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={weekdays.includes(weekday)}
                onChange={(event) =>
                  changePattern(setWeekdays)(
                    event.target.checked
                      ? [...weekdays, weekday]
                      : weekdays.filter((d) => d !== weekday),
                  )
                }
              />
              {WEEKDAY_LABELS[weekday]}
            </label>
          ))}
        </div>
        {errors.weekdays ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.weekdays}
          </p>
        ) : null}
      </fieldset>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Start time" error={errors.startTime} required>
          <Input
            type="time"
            step={300}
            value={startTime}
            onChange={(event) => changePattern(setStartTime)(event.target.value)}
          />
        </Field>
        <Field label="Length" error={errors.durationMin} required>
          <Select
            value={durationMin}
            onChange={(event) => changePattern(setDurationMin)(Number(event.target.value))}
          >
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="First day"
          error={errors.startsOn}
          required
          className="col-span-2 sm:col-span-1"
        >
          <Input
            type="date"
            value={startsOn}
            onChange={(event) => changePattern(setStartsOn)(event.target.value)}
          />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2 rounded-control border border-border p-3 text-sm">
        <legend className="px-1 font-medium">Ends</legend>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="end"
            className="size-4 accent-charcoal"
            checked={endBy === "count"}
            onChange={() => changePattern(setEndBy)("count")}
          />
          After
          <Input
            aria-label="Number of sessions"
            type="number"
            min={1}
            max={SERIES_MAX_OCCURRENCES}
            className="w-24"
            value={count}
            disabled={endBy !== "count"}
            onChange={(event) => changePattern(setCount)(event.target.value)}
          />
          sessions
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="end"
            className="size-4 accent-charcoal"
            checked={endBy === "date"}
            onChange={() => changePattern(setEndBy)("date")}
          />
          On
          <Input
            aria-label="Last day"
            type="date"
            className="w-44"
            value={endsOn}
            disabled={endBy !== "date"}
            onChange={(event) => changePattern(setEndsOn)(event.target.value)}
          />
        </label>
        {errors.occurrenceCount || errors.endsOn ? (
          <p role="alert" className="text-xs font-medium text-danger">
            {errors.occurrenceCount ?? errors.endsOn}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Up to {SERIES_MAX_OCCURRENCES} sessions per series.
        </p>
      </fieldset>
      <WhereFields
        online={isOnline}
        setOnline={changePattern(setOnline)}
        location={location}
        setLocation={setLocation}
        meetingUrl={meetingUrl}
        setMeetingUrl={setMeetingUrl}
        errors={errors}
      />

      {preview ? (
        <section aria-labelledby="series-dates" className="flex flex-col gap-2">
          <h3 id="series-dates" className="text-sm font-semibold">
            {preview.occurrences.length} sessions
            {preview.capped ? ` (the first ${SERIES_MAX_OCCURRENCES})` : ""}
          </h3>
          {preview.occurrences.some((o) => o.conflict) ? (
            <p className="flex items-center gap-2 rounded-control bg-warning-soft p-2 text-sm text-warning">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              Some dates overlap other appointments. They&apos;re skipped; untick to keep one after
              moving the other appointment.
            </p>
          ) : null}
          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-control border border-border">
            {preview.occurrences.map((occurrence) => (
              <li
                key={occurrence.date}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span
                  className={cn(
                    skip.includes(occurrence.date) && "text-muted-foreground line-through",
                  )}
                >
                  {dayLabel(occurrence.date)} · {timeLabel(occurrence.startTime)}
                </span>
                {occurrence.conflict ? (
                  <label className="flex min-h-9 items-center gap-2 text-xs">
                    <span className="text-danger">
                      Overlaps {occurrence.conflict.title} at {occurrence.conflict.startTime}
                    </span>
                    <Checkbox
                      aria-label={`Skip ${occurrence.date}`}
                      checked={skip.includes(occurrence.date)}
                      onChange={(event) =>
                        setSkip(
                          event.target.checked
                            ? [...skip, occurrence.date]
                            : skip.filter((date) => date !== occurrence.date),
                        )
                      }
                    />
                    Skip
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Problem message={problem} />
      {preview ? (
        <Button
          onClick={() => run(create)}
          loading={create.isPending}
          disabled={!online || toCreate === 0 || create.isSuccess}
        >
          Create {toCreate} session{toCreate === 1 ? "" : "s"}
        </Button>
      ) : (
        <Button
          variant="dark"
          onClick={() => run(check)}
          loading={check.isPending}
          disabled={!online}
        >
          Check dates
        </Button>
      )}
    </div>
  );
}
