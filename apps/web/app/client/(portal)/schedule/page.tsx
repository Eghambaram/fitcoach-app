import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { AppointmentRow } from "@/features/client-portal/client-display";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Schedule" };

/** Schedule (PROMPT §9, client board 11): own sessions with mode; never trainer notes. */
export default async function ClientSchedulePage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/client/schedule");
  if (!data) return <ErrorState description="We couldn't load your schedule. Please try again." />;
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold tracking-tight">My schedule</h1>
      <section aria-labelledby="upcoming-sessions" className="flex flex-col gap-2">
        <h2 id="upcoming-sessions" className="text-sm font-semibold text-muted-foreground">
          Upcoming
        </h2>
        {data.upcoming.length === 0 ? (
          <Card>
            <EmptyState
              icon={CalendarDays}
              title="No sessions booked"
              description="Sessions your trainer books with you will appear here."
            />
          </Card>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-card">
            {data.upcoming.map((appointment) => (
              <li key={appointment.id} className="px-4 py-3">
                <AppointmentRow appointment={appointment} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {data.past.length > 0 ? (
        <section aria-labelledby="past-sessions" className="flex flex-col gap-2">
          <h2 id="past-sessions" className="text-sm font-semibold text-muted-foreground">
            Recent
          </h2>
          <ul className="divide-y divide-border rounded-card border border-border bg-card">
            {data.past.map((appointment) => (
              <li key={appointment.id} className="px-4 py-3">
                <AppointmentRow appointment={appointment} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">Times are in {data.timezone}.</p>
    </div>
  );
}
