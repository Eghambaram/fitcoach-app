"use client";

import {
  type AddMeasurementRequest,
  type ChartRange,
  type ClientProgressResponse,
  createMeasurementTypeRequestSchema,
  type MeasurementPoint,
  UNIT_KIND_LABELS,
  UNIT_KINDS,
  type UnitKind,
} from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Modal } from "@/components/shared/overlays";
import { EmptyState, ErrorState, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { dayLabel } from "../calendar/dates";
import { MeasurementForm } from "./measurement-form";
import { formatValue, MetricChart, MetricSummary, MetricTabs, RangePicker } from "./metric-chart";

/** What the client sees (default nothing) and whether they may add their own values. */
function SharingCard({
  clientId,
  data,
  archived,
  onSaved,
}: {
  clientId: string;
  data: ClientProgressResponse;
  archived: boolean;
  onSaved: (next: ClientProgressResponse) => void;
}) {
  const online = useOnline();
  const initial = data.metrics.filter((metric) => metric.shared).map((metric) => metric.type.id);
  const [shared, setShared] = useState<string[]>(initial);
  const [selfLogging, setSelfLogging] = useState(data.selfLogging);
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.PUT("/v1/clients/{id}/progress-sharing", {
          params: { path: { id: clientId } },
          body: { typeIds: shared, selfLogging },
        }),
      ),
    onSuccess: (next) => {
      onSaved(next);
      toast.success("Sharing saved.");
    },
    onError: (failure) => toast.error(failure.message),
  });
  const dirty =
    selfLogging !== data.selfLogging ||
    JSON.stringify([...shared].sort()) !== JSON.stringify([...initial].sort());
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-semibold">Shared with the client</h2>
      <p className="text-sm text-muted-foreground">
        They see only the measurements you tick, in their app. Nothing is shared by default.
      </p>
      <fieldset disabled={archived} className="flex flex-wrap gap-x-5 gap-y-1">
        <legend className="sr-only">Measurements they can see</legend>
        {data.types.map((type) => (
          <label key={type.id} className="flex min-h-11 items-center gap-2 text-sm">
            <Checkbox
              checked={shared.includes(type.id)}
              onChange={(event) =>
                setShared((current) =>
                  event.target.checked
                    ? [...current, type.id]
                    : current.filter((id) => id !== type.id),
                )
              }
            />
            {type.name}
          </label>
        ))}
      </fieldset>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Checkbox
          checked={selfLogging}
          disabled={archived}
          onChange={(event) => setSelfLogging(event.target.checked)}
        />
        <span>Let them add their own values for shared measurements</span>
      </label>
      <Button
        variant="dark"
        className="self-start"
        disabled={!dirty || !online || archived}
        loading={save.isPending}
        onClick={() => save.mutate()}
      >
        Save sharing
      </Button>
    </Card>
  );
}

function NewTypeForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [unitKind, setUnitKind] = useState<UnitKind>("length");
  const [error, setError] = useState<string>();
  const create = useMutation({
    mutationFn: () =>
      unwrap(browserApi.POST("/v1/measurement-types", { body: { name, unitKind } })),
    onSuccess: (type) => {
      toast.success(`${type.name} added to your measurements.`);
      onCreated();
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiRequestError
          ? (failure.body.fieldErrors?.name?.[0] ?? failure.message)
          : failure.message,
      ),
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = createMeasurementTypeRequestSchema.safeParse({ name, unitKind });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        create.mutate();
      }}
    >
      <Field label="Name" error={error}>
        <Input maxLength={60} value={name} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="What it measures">
        <Select value={unitKind} onChange={(event) => setUnitKind(event.target.value as UnitKind)}>
          {UNIT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {UNIT_KIND_LABELS[kind]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Add measurement type
        </Button>
      </div>
    </form>
  );
}

/** Client profile → Progress (PROMPT §8.8): values, charts, corrections and sharing. */
export function ClientProgressTab({ clientId, archived }: { clientId: string; archived: boolean }) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const key = ["client-progress", clientId];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      unwrap(browserApi.GET("/v1/clients/{id}/progress", { params: { path: { id: clientId } } })),
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>("3m");
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState(false);
  const [voiding, setVoiding] = useState<MeasurementPoint | null>(null);
  const [reason, setReason] = useState("");
  const store = (next: ClientProgressResponse) => queryClient.setQueryData(key, next);

  const add = useMutation({
    mutationFn: (body: AddMeasurementRequest) =>
      unwrap(
        browserApi.POST("/v1/clients/{id}/measurements", {
          params: { path: { id: clientId } },
          body,
        }),
      ),
    onSuccess: (next, body) => {
      store(next);
      setSelected(body.typeId);
      setAdding(false);
      toast.success("Value saved.");
    },
  });
  const voidValue = useMutation({
    mutationFn: (id: string) =>
      unwrap(
        browserApi.POST("/v1/measurements/{id}/void", {
          params: { path: { id } },
          body: { reason },
        }),
      ),
    onSuccess: (next) => {
      store(next);
      setVoiding(null);
      setReason("");
      toast.success("Value corrected. Add the right one if you have it.");
    },
    onError: (failure) => toast.error(failure.message),
  });

  if (query.isPending) {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState description="We couldn't load their progress. Please try again." />;
  }
  const data = query.data;
  const withValues = data.metrics;
  const current = withValues.find((metric) => metric.type.id === selected) ?? withValues[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={!online || archived} onClick={() => setNewType(true)}>
          New measurement type
        </Button>
        <Button disabled={!online || archived} onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          Add value
        </Button>
      </div>

      {current ? (
        <Card className="flex flex-col gap-4 p-5">
          <MetricTabs metrics={withValues} selected={current.type.id} onSelect={setSelected} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <MetricSummary metric={current} units={data.units} />
            <StatusPill tone={current.shared ? "success" : "neutral"}>
              {current.shared ? "Shared with client" : "Not shared"}
            </StatusPill>
          </div>
          <RangePicker value={range} onChange={setRange} />
          <MetricChart metric={current} units={data.units} range={range} today={data.today} />
          <table className="w-full text-sm">
            <caption className="sr-only">{current.type.name} values</caption>
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 font-medium">
                  Date
                </th>
                <th scope="col" className="py-1 font-medium">
                  Value
                </th>
                <th scope="col" className="py-1 font-medium">
                  By
                </th>
                <th scope="col" className="py-1">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...current.points].reverse().map((point) => (
                <tr key={point.id}>
                  <td className="py-2">{dayLabel(point.measuredOn)}</td>
                  <td className="py-2 font-semibold">
                    {formatValue(point.value, current.type.unitKind, data.units)}
                    {point.note ? (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {point.note}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2">{point.source === "client" ? "Client" : "You"}</td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      disabled={!online || archived}
                      onClick={() => setVoiding(point)}
                      aria-label={`Correct ${formatValue(point.value, current.type.unitKind, data.units)} on ${dayLabel(point.measuredOn)}`}
                    >
                      Correct
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {current.voided.length > 0 ? (
            <details className="text-sm">
              <summary className="min-h-11 cursor-pointer py-2 font-medium">
                Corrected values ({current.voided.length})
              </summary>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {current.voided.map((point) => (
                  <li key={point.id}>
                    <s>{formatValue(point.value, current.type.unitKind, data.units)}</s> on{" "}
                    {dayLabel(point.measuredOn)}: {point.voidReason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={LineChart}
            title="No measurements yet"
            description="Add a value to start their charts."
          />
        </Card>
      )}

      <SharingCard
        key={JSON.stringify([data.selfLogging, data.metrics.map((m) => [m.type.id, m.shared])])}
        clientId={clientId}
        data={data}
        archived={archived}
        onSaved={store}
      />

      <Modal open={adding} onOpenChange={setAdding} title="Add a value">
        {adding ? (
          <MeasurementForm
            types={data.types}
            units={data.units}
            today={data.today}
            initialTypeId={current?.type.id}
            pending={add.isPending}
            error={add.error instanceof ApiRequestError ? add.error : null}
            onSubmit={(body) => add.mutate(body)}
            onCancel={() => setAdding(false)}
          />
        ) : null}
      </Modal>
      <Modal open={newType} onOpenChange={setNewType} title="New measurement type">
        {newType ? (
          <NewTypeForm
            onCancel={() => setNewType(false)}
            onCreated={() => {
              setNewType(false);
              void queryClient.invalidateQueries({ queryKey: key });
            }}
          />
        ) : null}
      </Modal>
      <Modal
        open={voiding !== null}
        onOpenChange={(open) => (open ? null : setVoiding(null))}
        title="Correct this value?"
        description="It stays in the history, marked as corrected. Then add the right value."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (voiding && reason.trim()) voidValue.mutate(voiding.id);
          }}
        >
          <Field label="What's wrong with it?" required>
            <Input
              maxLength={200}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setVoiding(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="dark"
              loading={voidValue.isPending}
              disabled={!reason.trim()}
            >
              Mark as corrected
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
