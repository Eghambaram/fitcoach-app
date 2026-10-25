import type { Metadata } from "next";
import { ErrorState } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { CalendarScreen } from "@/features/calendar/calendar-screen";
import { addDays, CALENDAR_VIEWS, type CalendarView, viewRange } from "@/features/calendar/dates";
import { getSession, serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Calendar" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Calendar (PROMPT §8.6). View and date live in the URL; the appointment drawer is `?appt=`. */
export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const session = await getSession();
  const timeZone =
    session.status === "signed_in"
      ? (session.me.workspace?.timezone ?? "Asia/Kolkata")
      : "Asia/Kolkata";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  const rawDate = single(params.date);
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const rawView = single(params.view);
  const view = CALENDAR_VIEWS.includes(rawView as CalendarView) ? (rawView as CalendarView) : null;

  // No chosen view: load the week (desktop) and the two-week agenda (phones) in one range.
  const range = view
    ? viewRange(view, date)
    : { from: viewRange("week", date).from, to: addDays(date, 13) };

  const api = await serverApi();
  const [list, pending] = await Promise.all([
    api.GET("/v1/appointments", { params: { query: range } }),
    api.GET("/v1/appointments/needs-attendance"),
  ]);
  if (!list.data || !pending.data) {
    return (
      <Card>
        <ErrorState description="We couldn't load your calendar. Please try again." />
      </Card>
    );
  }
  return <CalendarScreen list={list.data} pending={pending.data} view={view} date={date} />;
}
