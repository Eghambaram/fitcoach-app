"use client";

import type { ClientWorkoutSummary, PortalWorkoutsResponse } from "@fitcoach/shared";
import { Dumbbell } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { WorkoutLink } from "./client-display";

/** YYYY-MM-DD + n days (UTC). */
function addDays(day: string, days: number): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function weekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/** This week / Next week / Later (client board 3). */
function groups(items: ClientWorkoutSummary[], today: string) {
  const nextWeek = addDays(weekStart(today), 7);
  const later = addDays(nextWeek, 7);
  return [
    { label: "This week", items: items.filter((item) => item.scheduledOn < nextWeek) },
    {
      label: "Next week",
      items: items.filter((item) => item.scheduledOn >= nextWeek && item.scheduledOn < later),
    },
    { label: "Later", items: items.filter((item) => item.scheduledOn >= later) },
  ].filter((group) => group.items.length > 0);
}

/** My Workouts (PROMPT §9, client board 3): Upcoming / Past. */
export function ClientWorkouts({
  data,
  canLog,
}: {
  data: PortalWorkoutsResponse;
  canLog: boolean;
}) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const items = tab === "upcoming" ? data.upcoming : data.past;
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">My workouts</h1>
      <div role="tablist" aria-label="Workouts" className="grid grid-cols-2 border-b border-border">
        {(
          [
            ["upcoming", "Upcoming"],
            ["past", "Past"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "min-h-11 border-b-2 text-sm font-semibold",
              tab === value ? "border-charcoal" : "border-transparent text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="flex flex-col gap-5">
        {items.length === 0 ? (
          <Card>
            <EmptyState
              icon={Dumbbell}
              title={tab === "upcoming" ? "Nothing planned yet" : "No past workouts yet"}
              description={
                tab === "upcoming"
                  ? "Your trainer's planned workouts will appear here."
                  : "Workouts you've done or missed will show up here."
              }
            />
          </Card>
        ) : tab === "upcoming" ? (
          groups(items, data.today).map((group) => (
            <section key={group.label} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{group.label}</h2>
              <ul className="divide-y divide-border rounded-card border border-border bg-card">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <WorkoutLink workout={item} canLog={canLog} today={data.today} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-card">
            {items.map((item) => (
              <li key={item.id}>
                <WorkoutLink workout={item} canLog={canLog} today={data.today} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
