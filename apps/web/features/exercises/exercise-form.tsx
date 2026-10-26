"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EQUIPMENT,
  EQUIPMENT_LABELS,
  type Exercise,
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_LABELS,
  type ExerciseInput,
  exerciseInputSchema,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUPS,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useOnline } from "@/components/shared/offline-banner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

const FIELDS = [
  "name",
  "category",
  "muscleGroups",
  "equipment",
  "difficulty",
  "instructions",
  "safetyNotes",
  "mediaUrl",
] as const;

/** A wrapping group of toggle chips for a multi-select (real checkboxes, so keyboard and screen readers work). */
function ChipGroup<T extends string>({
  legend,
  options,
  labels,
  value,
  onChange,
  error,
}: {
  legend: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T[];
  onChange: (next: T[]) => void;
  error?: string;
}) {
  const errorId = `${legend.replace(/\W+/g, "-").toLowerCase()}-error`;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1 text-sm font-medium">
        {legend} <span className="text-danger">*</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = value.includes(option);
          return (
            <label
              key={option}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-charcoal",
                checked ? "border-charcoal bg-muted font-medium" : "border-border bg-card",
              )}
            >
              <input
                type="checkbox"
                className="size-4 accent-charcoal"
                checked={checked}
                onChange={() =>
                  onChange(checked ? value.filter((item) => item !== option) : [...value, option])
                }
              />
              {labels[option]}
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/** Add or edit a custom exercise (§8.5). Library exercises are read-only. */
export function ExerciseForm({
  exercise,
  onSaved,
}: {
  exercise: Exercise | null;
  onSaved: (saved: Exercise) => void;
}) {
  const online = useOnline();
  const [problem, setProblem] = useState<string | null>(null);
  const form = useForm<ExerciseInput>({
    resolver: zodResolver(exerciseInputSchema),
    defaultValues: exercise
      ? {
          name: exercise.name,
          category: exercise.category,
          muscleGroups: exercise.muscleGroups,
          equipment: exercise.equipment,
          difficulty: exercise.difficulty,
          instructions: exercise.instructions ?? "",
          safetyNotes: exercise.safetyNotes ?? "",
          mediaUrl: exercise.mediaUrl ?? "",
        }
      : {
          name: "",
          category: "strength",
          muscleGroups: [],
          equipment: [],
          difficulty: "beginner",
          instructions: "",
          safetyNotes: "",
          mediaUrl: "",
        },
  });
  const { register, handleSubmit, formState, setError, control } = form;
  const errors = formState.errors;
  const save = useMutation({
    mutationFn: (body: ExerciseInput) =>
      exercise
        ? unwrap(
            browserApi.PUT("/v1/exercises/{id}", { params: { path: { id: exercise.id } }, body }),
          )
        : unwrap(browserApi.POST("/v1/exercises", { body })),
    onSuccess: onSaved,
    onError: (failure) => {
      if (failure instanceof ApiRequestError && failure.body.fieldErrors) {
        applyFieldErrors(failure, setError, FIELDS);
      }
      setProblem(failure.message);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((body) => {
        setProblem(null);
        save.mutate(body);
      })}
    >
      <Field label="Name" error={errors.name?.message} required>
        <Input maxLength={80} placeholder="e.g. Landmine Press" {...register("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={errors.category?.message} required>
          <Select {...register("category")}>
            {EXERCISE_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {EXERCISE_CATEGORY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Difficulty" error={errors.difficulty?.message} required>
          <Select {...register("difficulty")}>
            {DIFFICULTIES.map((value) => (
              <option key={value} value={value}>
                {DIFFICULTY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Controller
        control={control}
        name="muscleGroups"
        render={({ field }) => (
          <ChipGroup
            legend="Muscle groups"
            options={MUSCLE_GROUPS}
            labels={MUSCLE_GROUP_LABELS}
            value={field.value}
            onChange={field.onChange}
            error={errors.muscleGroups?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="equipment"
        render={({ field }) => (
          <ChipGroup
            legend="Equipment"
            options={EQUIPMENT}
            labels={EQUIPMENT_LABELS}
            value={field.value}
            onChange={field.onChange}
            error={errors.equipment?.message}
          />
        )}
      />
      <Field label="Instructions (optional)" error={errors.instructions?.message}>
        <Textarea rows={4} maxLength={1500} {...register("instructions")} />
      </Field>
      <Field label="Safety notes (optional)" error={errors.safetyNotes?.message}>
        <Textarea rows={2} maxLength={600} {...register("safetyNotes")} />
      </Field>
      <Field
        label="Demo video link (optional)"
        error={errors.mediaUrl?.message}
        hint="A link to a video you're allowed to share, e.g. on YouTube. Uploads aren't supported yet."
      >
        <Input type="url" inputMode="url" maxLength={500} {...register("mediaUrl")} />
      </Field>
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" loading={save.isPending} disabled={!online}>
        {exercise ? "Save changes" : "Add exercise"}
      </Button>
    </form>
  );
}
