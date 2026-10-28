"use client";

import {
  type AddMeasurementRequest,
  addMeasurementRequestSchema,
  type InputUnit,
  type MeasurementType,
  unitsFor,
} from "@fitcoach/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import type { ApiRequestError } from "@/lib/api/errors";
import type { Units } from "./metric-chart";

type Errors = Partial<Record<keyof AddMeasurementRequest, string>>;

function defaultUnit(type: MeasurementType | undefined, units: Units): InputUnit {
  if (!type) return "kg";
  if (type.unitKind === "mass") return units.weightUnit;
  if (type.unitKind === "length") return units.lengthUnit;
  return unitsFor(type.unitKind)[0] ?? "count";
}

/**
 * Add a value (§8.8): the measurement, the number in a unit of its kind (converted to kg/cm by the
 * API), the date and an optional note. Used by the trainer and, with self-logging, the client.
 */
export function MeasurementForm({
  types,
  units,
  today,
  initialTypeId,
  pending,
  error,
  withNote = true,
  onSubmit,
  onCancel,
}: {
  types: MeasurementType[];
  units: Units;
  today: string;
  initialTypeId?: string;
  pending: boolean;
  error: ApiRequestError | null;
  withNote?: boolean;
  onSubmit: (body: AddMeasurementRequest) => void;
  onCancel: () => void;
}) {
  const [typeId, setTypeId] = useState(initialTypeId ?? types[0]?.id ?? "");
  const type = types.find((item) => item.id === typeId);
  const [unit, setUnit] = useState<InputUnit>(defaultUnit(type, units));
  const [value, setValue] = useState("");
  const [measuredOn, setMeasuredOn] = useState(today);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const server = (key: keyof AddMeasurementRequest) => error?.body.fieldErrors?.[key]?.[0];

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = addMeasurementRequestSchema.safeParse({
          typeId,
          value: value === "" ? undefined : Number(value),
          unit,
          measuredOn,
          note: withNote ? note : undefined,
        });
        if (!parsed.success) {
          const next: Errors = {};
          for (const issue of parsed.error.issues) {
            next[issue.path[0] as keyof AddMeasurementRequest] ??= issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSubmit(parsed.data);
      }}
    >
      <Field label="Measurement" error={errors.typeId ?? server("typeId")}>
        <Select
          value={typeId}
          onChange={(event) => {
            setTypeId(event.target.value);
            setUnit(
              defaultUnit(
                types.find((item) => item.id === event.target.value),
                units,
              ),
            );
          }}
        >
          {types.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Field label="Value" error={errors.value ?? server("value")}>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
        <Field label="Unit" error={errors.unit ?? server("unit")}>
          <Select value={unit} onChange={(event) => setUnit(event.target.value as InputUnit)}>
            {(type ? unitsFor(type.unitKind) : []).map((item) => (
              <option key={item} value={item}>
                {item === "count" ? "number" : item}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Date" error={errors.measuredOn ?? server("measuredOn")}>
        <Input
          type="date"
          max={today}
          value={measuredOn}
          onChange={(event) => setMeasuredOn(event.target.value)}
        />
      </Field>
      {withNote ? (
        <Field
          label="Note (optional)"
          error={errors.note ?? server("note")}
          hint="Only you see this."
        >
          <Input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      ) : null}
      {error && !error.body.fieldErrors ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          Save value
        </Button>
      </div>
    </form>
  );
}
