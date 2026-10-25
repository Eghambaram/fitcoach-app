/**
 * Calendar date maths on YYYY-MM-DD strings (workspace-local days from the API), stepped in UTC so
 * the browser's own time zone never shifts a day.
 */

export const CALENDAR_VIEWS = ["week", "day", "agenda"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

const AGENDA_DAYS = 14;

function toDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, days: number): string {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoWeekday(day: string): number {
  const weekday = toDate(day).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

export function weekStart(day: string): string {
  return addDays(day, 1 - isoWeekday(day));
}

/** The days a view shows, first to last (inclusive). */
export function viewRange(view: CalendarView, day: string): { from: string; to: string } {
  if (view === "day") return { from: day, to: day };
  if (view === "week") {
    const from = weekStart(day);
    return { from, to: addDays(from, 6) };
  }
  return { from: day, to: addDays(day, AGENDA_DAYS - 1) };
}

/** Where "previous" / "next" go from `day` in a view. */
export function step(view: CalendarView, day: string, direction: 1 | -1): string {
  const size = view === "day" ? 1 : view === "week" ? 7 : AGENDA_DAYS;
  return addDays(day, size * direction);
}

export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

export function dayLabel(day: string, style: "short" | "long" = "short"): string {
  return toDate(day).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: "short",
  });
}

export function rangeLabel(from: string, to: string): string {
  const options: Intl.DateTimeFormatOptions = { timeZone: "UTC", day: "numeric", month: "short" };
  const start = toDate(from).toLocaleDateString("en-IN", options);
  if (from === to) return dayLabel(from, "long");
  const end = toDate(to).toLocaleDateString("en-IN", { ...options, year: "numeric" });
  return `${start} – ${end}`;
}

/** "07:30" → "7:30 am". */
export function timeLabel(hhmm: string): string {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  const suffix = hours < 12 ? "am" : "pm";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function minutesOf(hhmm: string): number {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
}
