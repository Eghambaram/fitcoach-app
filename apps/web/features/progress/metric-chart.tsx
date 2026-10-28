"use client";

import { CHART_RANGE_LABELS, CHART_RANGES, type ChartRange, type Metric } from "@fitcoach/shared";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { dayLabel } from "../calendar/dates";
import { display, formatChange, formatValue, unitLabel, type Units } from "./format";

export { display, formatChange, formatValue, unitLabel, type Units } from "./format";

function rangeStart(range: ChartRange, today: string): string | null {
  const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12, all: 0 }[range];
  if (!months) return null;
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

export function RangePicker({
  value,
  onChange,
}: {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Chart range"
      className="flex w-fit gap-1 rounded-control border border-border bg-card p-1"
    >
      {CHART_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          onClick={() => onChange(range)}
          className={cn(
            "min-h-9 min-w-11 rounded-[10px] px-2 text-sm font-medium",
            value === range ? "bg-charcoal text-white" : "hover:bg-muted",
          )}
        >
          {CHART_RANGE_LABELS[range]}
        </button>
      ))}
    </div>
  );
}

/** First vs latest and the change (§8.8); % only for body weight, labelled. */
export function MetricSummary({ metric, units }: { metric: Metric; units: Units }) {
  const kind = metric.type.unitKind;
  if (!metric.latest) {
    return <p className="text-sm text-muted-foreground">No values yet.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-3xl font-bold">{formatValue(metric.latest.value, kind, units)}</p>
      {metric.change !== null && metric.first ? (
        <p className="text-sm">
          <span className="font-semibold">{formatChange(metric.change, kind, units)}</span>
          {metric.percentChange !== null
            ? ` (${metric.percentChange > 0 ? "+" : ""}${metric.percentChange}% of body weight)`
            : ""}{" "}
          since {dayLabel(metric.first.measuredOn)} ({formatValue(metric.first.value, kind, units)})
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Measured {dayLabel(metric.latest.measuredOn)}. Change shows from the second value.
        </p>
      )}
    </div>
  );
}

/** Trend for one metric, in the viewer's units; empty state below two points (§8.8). */
export function MetricChart({
  metric,
  units,
  range,
  today,
}: {
  metric: Metric;
  units: Units;
  range: ChartRange;
  today: string;
}) {
  const kind = metric.type.unitKind;
  const from = rangeStart(range, today);
  const points = metric.points.filter((point) => !from || point.measuredOn >= from);
  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {metric.points.length < 2
          ? "A chart appears once there are two values."
          : "Fewer than two values in this range. Try a longer range."}
      </p>
    );
  }
  const unit = unitLabel(kind, units);
  const data = points.map((point) => ({
    date: point.measuredOn,
    label: dayLabel(point.measuredOn),
    value: display(point.value, kind, units),
  }));
  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label={`${metric.type.name} from ${data[0]?.label} to ${data.at(-1)?.label}: ${data
        .map((point) => `${point.value}${unit ? ` ${unit}` : ""}`)
        .join(", ")}`}
    >
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis domain={["auto", "auto"]} tick={{ fontSize: 12 }} width={48} />
          <Tooltip
            formatter={(value) => [`${String(value)}${unit ? ` ${unit}` : ""}`, metric.type.name]}
          />
          <Line
            type="monotone"
            dataKey="value"
            name={metric.type.name}
            stroke="var(--success)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Metric tabs (Weight / Body fat / …). */
export function MetricTabs({
  metrics,
  selected,
  onSelect,
}: {
  metrics: Metric[];
  selected: string;
  onSelect: (typeId: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Measurements"
      className="flex gap-1 overflow-x-auto border-b border-border"
    >
      {metrics.map((metric) => (
        <button
          key={metric.type.id}
          type="button"
          role="tab"
          aria-selected={selected === metric.type.id}
          onClick={() => onSelect(metric.type.id)}
          className={cn(
            "min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold whitespace-nowrap",
            selected === metric.type.id
              ? "border-charcoal"
              : "border-transparent text-muted-foreground",
          )}
        >
          {metric.type.name}
        </button>
      ))}
    </div>
  );
}
