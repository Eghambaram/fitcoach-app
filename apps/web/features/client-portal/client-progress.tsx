"use client";

import {
  type AddMeasurementRequest,
  type ChartRange,
  type PortalProgressResponse,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { LineChart, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Modal } from "@/components/shared/overlays";
import { EmptyState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { dayLabel } from "../calendar/dates";
import { MeasurementForm } from "../progress/measurement-form";
import {
  formatValue,
  MetricChart,
  MetricSummary,
  MetricTabs,
  RangePicker,
} from "../progress/metric-chart";

/**
 * My progress (PROMPT §8.8, §9, client boards 7–8): the metrics the trainer shared, with charts;
 * "+ Add" only when the trainer turned self-logging on.
 */
export function ClientProgress({ initial }: { initial: PortalProgressResponse }) {
  const online = useOnline();
  const [data, setData] = useState(initial);
  const [selected, setSelected] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>("3m");
  const [adding, setAdding] = useState(false);
  const add = useMutation({
    mutationFn: (body: AddMeasurementRequest) =>
      unwrap(browserApi.POST("/v1/client/measurements", { body })),
    onSuccess: (next, body) => {
      setData(next);
      setSelected(body.typeId);
      setAdding(false);
      toast.success("Saved.");
    },
  });
  const current = data.metrics.find((metric) => metric.type.id === selected) ?? data.metrics[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">My progress</h1>
        {data.canLog && data.metrics.length > 0 ? (
          <Button disabled={!online} onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" />
            Add
          </Button>
        ) : null}
      </div>
      {current ? (
        <Card className="flex flex-col gap-4 p-5">
          <MetricTabs metrics={data.metrics} selected={current.type.id} onSelect={setSelected} />
          <h2 className="text-sm font-medium text-muted-foreground">{current.type.name}</h2>
          <MetricSummary metric={current} units={data.units} />
          <RangePicker value={range} onChange={setRange} />
          <MetricChart metric={current} units={data.units} range={range} today={data.today} />
          {current.points.length > 0 ? (
            <ul
              className="divide-y divide-border text-sm"
              aria-label={`${current.type.name} values`}
            >
              {[...current.points].reverse().map((point) => (
                <li key={point.id} className="flex justify-between py-2">
                  <span>{dayLabel(point.measuredOn)}</span>
                  <span className="font-semibold">
                    {formatValue(point.value, current.type.unitKind, data.units)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={LineChart}
            title="Nothing shared yet"
            description="Your trainer chooses which measurements to share with you. They'll appear here."
          />
        </Card>
      )}
      <Modal open={adding} onOpenChange={setAdding} title="Add a measurement">
        {adding ? (
          <MeasurementForm
            types={data.metrics.map((metric) => metric.type)}
            units={data.units}
            today={data.today}
            initialTypeId={current?.type.id}
            withNote={false}
            pending={add.isPending}
            error={add.error instanceof ApiRequestError ? add.error : null}
            onSubmit={(body) => add.mutate(body)}
            onCancel={() => setAdding(false)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
