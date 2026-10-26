"use client";

import {
  type Appointment,
  APPOINTMENT_KIND_LABELS,
  type AppointmentListResponse,
  type NeedsAttendanceResponse,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Drawer, Modal } from "@/components/shared/overlays";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { browserApi, unwrap } from "@/lib/api/browser";
import { cn } from "@/lib/utils";
import { AppointmentDrawer, AppointmentStatusPill, attendanceMessage } from "./appointment-drawer";
import { AppointmentForm, SeriesForm } from "./appointment-forms";
import {
  addDays,
  type CalendarView,
  dayLabel,
  daysBetween,
  minutesOf,
  rangeLabel,
  step,
  timeLabel,
  viewRange,
} from "./dates";

const HOUR_PX = 56;

function blockTone(appointment: Appointment): string {
  if (appointment.needsAttendance) return "border-danger bg-danger-soft";
  if (appointment.status === "completed") return "border-success bg-success-soft";
  if (appointment.status === "no_show") return "border-warning bg-warning-soft";
  if (appointment.kind === "trial") return "border-pink bg-pink-soft";
  return "border-charcoal bg-card";
}

/** Day columns with a time axis; cancelled appointments are left out (they're in the agenda). */
function TimeGrid({
  days,
  today,
  appointments,
  onOpen,
}: {
  days: string[];
  today: string;
  appointments: Appointment[];
  onOpen: (id: string) => void;
}) {
  const shown = appointments.filter((appointment) => appointment.status !== "cancelled");
  const starts = shown.map((a) => minutesOf(a.startTime));
  const ends = shown.map((a) => minutesOf(a.startTime) + a.durationMin);
  const first = Math.min(6, ...starts.map((m) => Math.floor(m / 60)));
  const last = Math.max(22, ...ends.map((m) => Math.ceil(m / 60)));
  const hours = Array.from({ length: Math.min(last, 24) - first }, (_, index) => first + index);

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-card">
      <div
        className={cn("grid", days.length > 1 && "min-w-[760px]")}
        style={{ gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <div className="border-b border-border" />
        {days.map((day) => (
          <div
            key={day}
            className={cn(
              "border-b border-l border-border px-2 py-2 text-center text-sm font-semibold",
              day === today && "bg-lime/40",
            )}
          >
            {dayLabel(day)}
          </div>
        ))}
        <div className="relative">
          {hours.map((hour) => (
            <div
              key={hour}
              className="pr-2 text-right text-xs text-muted-foreground"
              style={{ height: HOUR_PX }}
            >
              {timeLabel(`${String(hour).padStart(2, "0")}:00`).replace(":00", "")}
            </div>
          ))}
        </div>
        {days.map((day) => (
          <div
            key={day}
            className="relative border-l border-border"
            style={{ height: hours.length * HOUR_PX }}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                className="border-b border-border/60"
                style={{ height: HOUR_PX }}
                aria-hidden="true"
              />
            ))}
            {shown
              .filter((appointment) => appointment.date === day)
              .map((appointment) => {
                const top = ((minutesOf(appointment.startTime) - first * 60) / 60) * HOUR_PX;
                const height = Math.max((appointment.durationMin / 60) * HOUR_PX - 2, 26);
                return (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={() => onOpen(appointment.id)}
                    className={cn(
                      "absolute inset-x-1 overflow-hidden rounded-control border-l-4 px-2 py-1 text-left text-xs shadow-sm hover:brightness-95",
                      blockTone(appointment),
                    )}
                    style={{ top, height }}
                  >
                    <span className="block truncate font-semibold">
                      {appointment.person.fullName}
                    </span>
                    <span className="block truncate text-foreground/80">
                      {timeLabel(appointment.startTime)} ·{" "}
                      {APPOINTMENT_KIND_LABELS[appointment.kind]}
                      {appointment.needsAttendance ? " · mark attendance" : ""}
                    </span>
                  </button>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Agenda({
  days,
  today,
  appointments,
  onOpen,
}: {
  days: string[];
  today: string;
  appointments: Appointment[];
  onOpen: (id: string) => void;
}) {
  const busy = days.filter((day) => appointments.some((appointment) => appointment.date === day));
  if (busy.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CalendarDays}
          title="Nothing booked"
          description="No sessions in these two weeks."
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {busy.map((day) => (
        <section key={day} aria-labelledby={`day-${day}`}>
          <h2 id={`day-${day}`} className="mb-2 text-sm font-semibold">
            {day === today ? "Today · " : ""}
            {dayLabel(day, "long")}
          </h2>
          <ul className="flex flex-col gap-2">
            {appointments
              .filter((appointment) => appointment.date === day)
              .map((appointment) => (
                <li key={appointment.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(appointment.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-card border-l-4 bg-card p-3 text-left shadow-sm",
                      blockTone(appointment),
                    )}
                  >
                    <span className="w-16 shrink-0 text-sm font-semibold">
                      {timeLabel(appointment.startTime)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate font-medium",
                          appointment.status === "cancelled" && "text-foreground/80 line-through",
                        )}
                      >
                        {appointment.person.fullName}
                      </span>
                      <span className="block truncate text-xs text-foreground/80">
                        {APPOINTMENT_KIND_LABELS[appointment.kind]} · {appointment.durationMin} min
                        {appointment.location ? ` · ${appointment.location}` : ""}
                        {appointment.meetingUrl ? " · Online" : ""}
                      </span>
                    </span>
                    <AppointmentStatusPill appointment={appointment} />
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Past sessions still scheduled: mark them right here (§8.6). */
function NeedsAttendance({
  appointments,
  onDone,
}: {
  appointments: Appointment[];
  onDone: () => void;
}) {
  const online = useOnline();
  const mark = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "completed" | "no_show" }) =>
      unwrap(
        browserApi.POST("/v1/appointments/{id}/attendance", {
          params: { path: { id } },
          body: { status },
        }),
      ),
    onSuccess: (next) => {
      toast.success(attendanceMessage(next));
      onDone();
    },
    onError: (failure) => toast.error(failure.message),
  });
  if (appointments.length === 0) return null;
  return (
    <details
      className="rounded-card border border-danger/40 bg-danger-soft p-4"
      open={appointments.length <= 3}
    >
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-danger">
        <AlertCircle className="size-5" aria-hidden="true" />
        {appointments.length} past session{appointments.length === 1 ? " needs" : "s need"}{" "}
        attendance
      </summary>
      <ul className="mt-2 flex flex-col divide-y divide-danger/20">
        {appointments.map((appointment) => (
          <li
            key={appointment.id}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <span>
              <span className="font-medium">{appointment.person.fullName}</span> ·{" "}
              {dayLabel(appointment.date)} {timeLabel(appointment.startTime)}
            </span>
            <span className="flex gap-2">
              <Button
                disabled={!online || mark.isPending}
                onClick={() => mark.mutate({ id: appointment.id, status: "completed" })}
                aria-label={`Mark ${appointment.person.fullName} attended`}
              >
                Attended
              </Button>
              <Button
                variant="outline"
                disabled={!online || mark.isPending}
                onClick={() => mark.mutate({ id: appointment.id, status: "no_show" })}
                aria-label={`Mark ${appointment.person.fullName} no-show`}
              >
                No-show
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Calendar (PROMPT §8.6): week and day on desktop, agenda and day on mobile. Without a chosen view,
 * phones get the agenda and larger screens the week. Times are the workspace's.
 */
export function CalendarScreen({
  list,
  pending,
  view,
  date,
}: {
  list: AppointmentListResponse;
  pending: NeedsAttendanceResponse;
  view: CalendarView | null;
  date: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const online = useOnline();
  const [loading, startTransition] = useTransition();
  const [booking, setBooking] = useState(false);
  const [series, setSeries] = useState(false);
  const openId = params.get("appt");

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [name, value] of Object.entries(changes)) {
      if (value === null) next.delete(name);
      else next.set(name, value);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }
  const refresh = () => startTransition(() => router.refresh());
  const open = (id: string) => update({ appt: id });

  const current = view ?? "week";
  const range = viewRange(current, date);
  const pick = (from: string, to: string) =>
    list.appointments.filter((appointment) => appointment.date >= from && appointment.date <= to);
  const weekDays = daysBetween(viewRange("week", date).from, viewRange("week", date).to);
  const agendaRange = viewRange("agenda", date);

  const switcher = (
    <div
      className="flex rounded-control border border-border bg-card p-1"
      role="group"
      aria-label="View"
    >
      {(["week", "day", "agenda"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={(view ?? null) === option}
          onClick={() => update({ view: option })}
          className={cn(
            "min-h-9 rounded-[10px] px-3 text-sm font-medium capitalize",
            view === option ? "bg-charcoal text-white" : "text-foreground hover:bg-muted",
            option === "week" && "hidden sm:block",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Calendar"
        description={
          view ? (
            rangeLabel(range.from, range.to)
          ) : (
            <>
              <span className="sm:hidden">{rangeLabel(agendaRange.from, agendaRange.to)}</span>
              <span className="hidden sm:inline">{rangeLabel(range.from, range.to)}</span>
            </>
          )
        }
        actions={
          <>
            <Button disabled={!online} onClick={() => setBooking(true)}>
              <Plus aria-hidden="true" />
              Book session
            </Button>
            <Button variant="outline" disabled={!online} onClick={() => setSeries(true)}>
              <Repeat aria-hidden="true" />
              Recurring series
            </Button>
          </>
        }
      />

      <NeedsAttendance appointments={pending.appointments} onDone={refresh} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous"
            onClick={() => update({ date: step(current, date, -1) })}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" onClick={() => update({ date: list.today })}>
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next"
            onClick={() => update({ date: step(current, date, 1) })}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
        {switcher}
      </div>

      <div aria-busy={loading} className={loading ? "opacity-60 transition-opacity" : undefined}>
        {view === "day" ? (
          <TimeGrid
            days={[date]}
            today={list.today}
            appointments={pick(date, date)}
            onOpen={open}
          />
        ) : view === "agenda" ? (
          <Agenda
            days={daysBetween(agendaRange.from, agendaRange.to)}
            today={list.today}
            appointments={pick(agendaRange.from, agendaRange.to)}
            onOpen={open}
          />
        ) : view === "week" ? (
          <TimeGrid
            days={weekDays}
            today={list.today}
            appointments={pick(weekDays[0] ?? date, weekDays[6] ?? date)}
            onOpen={open}
          />
        ) : (
          <>
            <div className="sm:hidden">
              <Agenda
                days={daysBetween(agendaRange.from, agendaRange.to)}
                today={list.today}
                appointments={pick(agendaRange.from, agendaRange.to)}
                onOpen={open}
              />
            </div>
            <div className="hidden sm:block">
              <TimeGrid
                days={weekDays}
                today={list.today}
                appointments={pick(weekDays[0] ?? date, weekDays[6] ?? date)}
                onOpen={open}
              />
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Times are in your workspace time zone ({list.timezone}). Cancelled sessions show in the
        agenda.{" "}
        <Link href="/app/settings/packages" className="underline">
          Late-cancel window
        </Link>
      </p>

      <Modal open={booking} onOpenChange={setBooking} title="Book a session">
        {booking ? (
          <AppointmentForm
            defaultDate={date < list.today ? list.today : date}
            onSaved={(appointment) => {
              setBooking(false);
              toast.success("Session booked.");
              update({ appt: appointment.id, date: appointment.date });
            }}
          />
        ) : null}
      </Modal>
      <Drawer
        open={series}
        onOpenChange={setSeries}
        title="Recurring series"
        description="Regular sessions for one client, up to 52."
      >
        {series ? (
          <SeriesForm
            defaultDate={addDays(list.today, 1)}
            onSaved={(created) => {
              setSeries(false);
              toast.success(`${created} sessions booked.`);
              refresh();
            }}
          />
        ) : null}
      </Drawer>

      <AppointmentDrawer
        appointmentId={openId}
        onClose={() => update({ appt: null })}
        onChanged={refresh}
      />
    </div>
  );
}
