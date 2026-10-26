"use client";

import {
  type AssignProgramResponse,
  assignProgramRequestSchema,
  type ProgramDetail,
  WEEKDAY_NAMES,
} from "@fitcoach/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";

const todayIso = () => new Intl.DateTimeFormat("en-CA").format(new Date());

/**
 * Assign to a client (PROMPT §8.5): client, start date, a weekday per workout, instructions and
 * equipment/location notes. The client gets a copy of the program as it is now.
 */
export function AssignProgramForm({
  program,
  clientId,
  onAssigned,
}: {
  program: ProgramDetail;
  clientId?: string;
  onAssigned: (result: AssignProgramResponse, clientId: string) => void;
}) {
  const online = useOnline();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [client, setClient] = useState(clientId ?? "");
  const [startsOn, setStartsOn] = useState(todayIso());
  const [days, setDays] = useState(program.workouts.map((workout) => workout.dayNumber));
  const [instructions, setInstructions] = useState("");
  const [equipmentNotes, setEquipmentNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const options = useQuery({
    queryKey: ["client-options"],
    queryFn: () => unwrap(browserApi.GET("/v1/clients/options")),
    select: (data) => data.clients.filter((option) => option.status === "active"),
    enabled: clientId === undefined,
  });

  const assign = useMutation({
    mutationFn: (body: ReturnType<typeof assignProgramRequestSchema.parse>) =>
      unwrap(
        browserApi.POST("/v1/programs/{id}/assign", {
          params: { path: { id: program.id }, header: { "Idempotency-Key": idempotencyKey } },
          body,
        }),
      ),
    onSuccess: (result) => onAssigned(result, client),
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

  function submit() {
    setProblem(null);
    const parsed = assignProgramRequestSchema.safeParse({
      clientId: client,
      startsOn,
      schedule: days.map((weekday, workoutIndex) => ({ workoutIndex, weekday })),
      instructions,
      equipmentNotes,
    });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
        ),
      );
      return;
    }
    setErrors({});
    assign.mutate(parsed.data);
  }

  const empty = program.workouts.filter((workout) => workout.exercises.length === 0);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {empty.length > 0 ? (
        <p role="alert" className="rounded-control bg-warning-soft p-3 text-sm">
          Add exercises to {empty.map((workout) => workout.name).join(", ")} before assigning.
        </p>
      ) : null}
      {clientId === undefined ? (
        <Field
          label="Client"
          error={errors.clientId}
          required
          hint={
            options.isSuccess && options.data.length === 0
              ? "No active clients yet. Onboard a client first."
              : undefined
          }
        >
          <Select value={client} onChange={(event) => setClient(event.target.value)}>
            <option value="">{options.isPending ? "Loading clients…" : "Choose a client"}</option>
            {(options.data ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.fullName}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field
        label="Start date"
        error={errors.startsOn}
        required
        hint={`Runs ${program.durationWeeks} weeks.`}
      >
        <Input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} />
      </Field>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Schedule</legend>
        {program.workouts.map((workout, index) => (
          <Field key={workout.id} label={workout.name} error={errors[`schedule.${index}.weekday`]}>
            <Select
              value={days[index]}
              onChange={(event) =>
                setDays((current) =>
                  current.map((value, position) =>
                    position === index ? Number(event.target.value) : value,
                  ),
                )
              }
            >
              {Object.entries(WEEKDAY_NAMES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        ))}
        {errors.schedule ? (
          <p role="alert" className="text-sm text-danger">
            {errors.schedule}
          </p>
        ) : null}
      </fieldset>
      <Field label="Instructions for the client (optional)" error={errors.instructions}>
        <Textarea
          rows={3}
          maxLength={1000}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </Field>
      <Field label="Equipment or location notes (optional)" error={errors.equipmentNotes}>
        <Input
          maxLength={500}
          value={equipmentNotes}
          onChange={(event) => setEquipmentNotes(event.target.value)}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Their current program, if any, ends and its upcoming workouts are removed. Planned workouts
        appear for the next 4 weeks and keep rolling forward.
      </p>
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
      <Button
        type="submit"
        loading={assign.isPending}
        disabled={!online || assign.isSuccess || empty.length > 0}
      >
        Assign program
      </Button>
    </form>
  );
}
