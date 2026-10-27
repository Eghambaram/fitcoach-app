"use client";

import { type ClientCheckInsResponse, WEEKDAY_LABELS } from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, MessageCircle } from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { EmptyState, ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { cn } from "@/lib/utils";
import { dayLabel } from "../calendar/dates";
import { CheckInCard } from "./check-in-card";

const DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Self-reported trends (§8.7): energy, sleep and feeling (5 = great … 1 = poor). */
function TrendChart({ trend }: { trend: ClientCheckInsResponse["trend"] }) {
  if (trend.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        A trend appears once they have sent two check-ins.
      </p>
    );
  }
  const data = trend.map((point) => ({ ...point, label: dayLabel(point.date) }));
  return (
    <figure className="flex flex-col gap-2">
      <div
        className="h-56 w-full"
        role="img"
        aria-label="Self-reported energy, sleep and feeling over time"
      >
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis domain={[1, 10]} ticks={[1, 5, 10]} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="energy"
              name="Energy (1–10)"
              stroke="var(--charcoal)"
              strokeWidth={2}
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="sleep"
              name="Sleep (1–10)"
              stroke="var(--info)"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="feeling"
              name="Feeling (1–5)"
              stroke="var(--success)"
              strokeWidth={2}
              strokeDasharray="1 3"
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        Self-reported by the client over the last 60 days. Not a medical assessment.
      </figcaption>
    </figure>
  );
}

/** Per-client check-in settings (§8.7): on/off and weekdays, plus the Nudge link. */
function SettingsCard({
  clientId,
  data,
  archived,
  onSaved,
}: {
  clientId: string;
  data: ClientCheckInsResponse;
  archived: boolean;
  onSaved: (next: ClientCheckInsResponse) => void;
}) {
  const online = useOnline();
  const [enabled, setEnabled] = useState(data.settings.enabled);
  const [days, setDays] = useState<number[] | null>(data.settings.days);
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.PUT("/v1/clients/{id}/check-in-settings", {
          params: { path: { id: clientId } },
          body: { enabled, days },
        }),
      ),
    onSuccess: (next) => {
      onSaved(next);
      toast.success("Check-in settings saved.");
    },
    onError: (failure) => toast.error(failure.message),
  });
  const shownDays = days ?? data.settings.effectiveDays;
  const dirty =
    enabled !== data.settings.enabled ||
    JSON.stringify(days) !== JSON.stringify(data.settings.days);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Check-in settings</h2>
        {data.nudge && data.dueToday ? (
          <Button asChild variant="outline">
            <a href={data.nudge.url} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden="true" />
              Nudge on WhatsApp
            </a>
          </Button>
        ) : null}
      </div>
      {data.dueToday ? (
        <p className="text-sm text-muted-foreground">
          Today&apos;s check-in hasn&apos;t arrived yet.
        </p>
      ) : null}
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <Checkbox
          checked={enabled}
          disabled={archived}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span className="font-medium">Ask them for check-ins</span>
      </label>
      <fieldset disabled={!enabled || archived} className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Check-in days</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => {
            const on = shownDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on
                    ? shownDays.filter((value) => value !== day)
                    : [...shownDays, day].sort((a, b) => a - b);
                  if (next.length > 0) setDays(next);
                }}
                className={cn(
                  "min-h-11 min-w-12 rounded-full border px-3 text-sm font-medium disabled:opacity-50",
                  on ? "border-charcoal bg-charcoal text-white" : "border-border bg-card",
                )}
              >
                {WEEKDAY_LABELS[day]}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {days === null
            ? "Following your workspace default (Settings → Check-ins)."
            : "Their own days."}{" "}
          {days !== null ? (
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => setDays(null)}
            >
              Use the workspace default
            </button>
          ) : null}
        </p>
      </fieldset>
      <Button
        className="self-start"
        variant="dark"
        disabled={!dirty || !online || archived}
        loading={save.isPending}
        onClick={() => save.mutate()}
      >
        Save settings
      </Button>
    </Card>
  );
}

/** Client profile → Check-ins (PROMPT §8.7): settings, Nudge, trends and their check-ins. */
export function ClientCheckInsTab({ clientId, archived }: { clientId: string; archived: boolean }) {
  const queryClient = useQueryClient();
  const key = ["client-check-ins", clientId];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      unwrap(browserApi.GET("/v1/clients/{id}/check-ins", { params: { path: { id: clientId } } })),
  });

  if (query.isPending) {
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  if (query.isError || !query.data) {
    return <ErrorState description="We couldn't load their check-ins. Please try again." />;
  }
  const data = query.data;

  return (
    <div className="flex flex-col gap-5">
      <SettingsCard
        key={JSON.stringify(data.settings)}
        clientId={clientId}
        data={data}
        archived={archived}
        onSaved={(next) => queryClient.setQueryData(key, next)}
      />

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-semibold">Trends</h2>
        <TrendChart trend={data.trend} />
      </Card>

      {data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            title="No check-ins yet"
            description="Check-ins they send from their app appear here."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Check-ins">
          {data.items.map((item) => (
            <li key={item.id}>
              <CheckInCard
                checkIn={item}
                onReviewed={(next) =>
                  queryClient.setQueryData(key, {
                    ...data,
                    items: data.items.map((entry) => (entry.id === next.id ? next : entry)),
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
