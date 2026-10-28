import {
  APPOINTMENT_KIND_LABELS,
  APPOINTMENT_STATUS_LABELS,
  ATTENTION_LABELS,
  type DashboardAppointment,
  type DashboardSummary,
  METRIC_DEFINITIONS,
} from "@fitcoach/shared";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  MapPin,
  MessageCircle,
  PhoneCall,
  Users,
  UserPlus,
  Video,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { KpiCard } from "@/components/shared/page-header";
import { EmptyState, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { addDays, dayLabel, timeLabel } from "../calendar/dates";
import { describeActivity } from "../clients/activity";
import { formatDateTime } from "../leads/lead-display";
import { ChecklistCard } from "./checklist-card";

function appointmentHref(item: DashboardAppointment, date: string): string {
  return `/app/calendar?view=day&date=${date}&appt=${item.id}`;
}

/** Start / Join / View / mark attendance (§8.1 "Today's schedule"). */
function ScheduleAction({ item, date }: { item: DashboardAppointment; date: string }) {
  const open = item.status === "scheduled" || item.status === "confirmed";
  if (open && item.ended) {
    return (
      <Button asChild variant="dark">
        <Link href={appointmentHref(item, date)}>Mark attendance</Link>
      </Button>
    );
  }
  if (open && item.meetingUrl) {
    return (
      <Button asChild>
        <a href={item.meetingUrl} target="_blank" rel="noreferrer">
          <Video aria-hidden="true" />
          Join
        </a>
      </Button>
    );
  }
  if (open && item.workoutSessionId) {
    return (
      <Button asChild>
        <Link href={`/app/workouts/${item.workoutSessionId}`}>Start</Link>
      </Button>
    );
  }
  return (
    <Button asChild variant="outline">
      <Link href={appointmentHref(item, date)}>View</Link>
    </Button>
  );
}

/**
 * Trainer dashboard (PROMPT §8.1, trainer dashboard board): "What do I need to do today?" Every
 * number comes from `GET /v1/dashboard/summary`; definitions are in METRIC_DEFINITIONS.
 */
export function DashboardScreen({ summary, title }: { summary: DashboardSummary; title: string }) {
  const { kpis, date, today } = summary;
  const isToday = date === today;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{dayLabel(today, "long")}</p>
        </div>
        <Button asChild>
          <Link href="/app/clients/new">
            <UserPlus aria-hidden="true" />
            Add client
          </Link>
        </Button>
      </div>

      {summary.checklist.visible ? <ChecklistCard checklist={summary.checklist} /> : null}

      <section aria-label="Key numbers" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-3 sm:grid sm:grid-cols-3 xl:grid-cols-6">
          <li className="shrink-0">
            <KpiCard
              icon={CalendarDays}
              label={METRIC_DEFINITIONS.sessions_today.label}
              value={kpis.sessions.total}
              caption={`${kpis.sessions.inPerson} in person · ${kpis.sessions.online} online${kpis.sessions.trials ? ` · ${kpis.sessions.trials} trial${kpis.sessions.trials === 1 ? "" : "s"}` : ""}`}
              href={`/app/calendar?view=day&date=${today}`}
            />
          </li>
          <li className="shrink-0">
            <KpiCard
              icon={Users}
              label={METRIC_DEFINITIONS.active_clients.label}
              value={kpis.activeClients}
              href="/app/clients"
            />
          </li>
          <li className="shrink-0">
            <KpiCard
              icon={UserPlus}
              label={METRIC_DEFINITIONS.new_leads.label}
              value={kpis.newLeads}
              caption="Last 7 days"
              href="/app/leads"
            />
          </li>
          <li className="shrink-0">
            <KpiCard
              icon={PhoneCall}
              label={METRIC_DEFINITIONS.follow_ups.label}
              value={kpis.followUps.due}
              caption={`${kpis.followUps.overdue} overdue`}
              href="/app/leads?followUp=due"
            />
          </li>
          <li className="shrink-0">
            <KpiCard
              icon={ClipboardCheck}
              label={METRIC_DEFINITIONS.check_ins_to_review.label}
              value={kpis.checkInsToReview}
              href="/app/check-ins"
            />
          </li>
          <li className="shrink-0">
            <KpiCard
              icon={Wallet}
              label="Payments due"
              value={kpis.paymentsDue}
              caption={`${kpis.packagesExpiring} package${kpis.packagesExpiring === 1 ? "" : "s"} expiring`}
              href="/app/clients?attention=payment_due"
            />
          </li>
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section aria-labelledby="schedule-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="schedule-heading" className="text-lg font-semibold">
              {isToday ? "Today's schedule" : `Schedule · ${dayLabel(date, "long")}`}
            </h2>
            <nav aria-label="Schedule day" className="flex items-center gap-1">
              <Button asChild variant="ghost" size="icon" aria-label="Previous day">
                <Link href={`/app/dashboard?date=${addDays(date, -1)}`}>
                  <ChevronLeft aria-hidden="true" />
                </Link>
              </Button>
              {isToday ? null : (
                <Button asChild variant="ghost">
                  <Link href="/app/dashboard">Today</Link>
                </Button>
              )}
              <Button asChild variant="ghost" size="icon" aria-label="Next day">
                <Link href={`/app/dashboard?date=${addDays(date, 1)}`}>
                  <ChevronRight aria-hidden="true" />
                </Link>
              </Button>
            </nav>
          </div>
          {summary.schedule.length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title="Nothing booked"
                description="Sessions and trials you book appear here."
                action={
                  <Button asChild variant="outline">
                    <Link href="/app/calendar">Open calendar</Link>
                  </Button>
                }
              />
            </Card>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
              {summary.schedule.map((item) => {
                const online = item.kind === "online_session" || item.meetingUrl !== null;
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="w-20 shrink-0 text-sm">
                      <p className="font-semibold">{timeLabel(item.startTime)}</p>
                      <p className="text-muted-foreground">{item.durationMin} min</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {item.person.fullName}
                        {item.kind === "trial" ? <StatusPill tone="pink">Trial</StatusPill> : null}
                        {item.status !== "scheduled" ? (
                          <StatusPill tone={item.status === "completed" ? "success" : "neutral"}>
                            {APPOINTMENT_STATUS_LABELS[item.status]}
                          </StatusPill>
                        ) : null}
                      </p>
                      <p className="flex items-center gap-1 text-sm text-muted-foreground">
                        {online ? (
                          <Video className="size-4" aria-hidden="true" />
                        ) : (
                          <MapPin className="size-4" aria-hidden="true" />
                        )}
                        {APPOINTMENT_KIND_LABELS[item.kind]} · {online ? "Online" : "In person"}
                        {item.location ? ` · ${item.location}` : ""}
                      </p>
                    </div>
                    <ScheduleAction item={item} date={date} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="attention-heading" className="flex flex-col gap-3">
          <h2 id="attention-heading" className="text-lg font-semibold">
            Needs attention
          </h2>
          {summary.attention.length === 0 ? (
            <Card>
              <EmptyState
                icon={AlertTriangle}
                title="All clear"
                description="Overdue follow-ups, payments, check-ins and sessions to mark show up here."
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {summary.attention.map((group) => (
                <Card key={group.kind} className="flex flex-col gap-2 p-4">
                  <h3 className="flex items-center justify-between gap-2 text-sm font-semibold">
                    {ATTENTION_LABELS[group.kind]}
                    <Link
                      href={group.href}
                      className="text-xs font-medium underline underline-offset-2"
                    >
                      {group.count > group.items.length ? `All ${group.count}` : `${group.count}`}
                      <span className="sr-only"> — open the list</span>
                    </Link>
                  </h3>
                  <ul className="flex flex-col divide-y divide-border">
                    {group.items.map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
                        <Link
                          href={item.href}
                          className="min-w-0 flex-1 rounded-control text-sm hover:underline focus-visible:outline-2 focus-visible:outline-charcoal"
                        >
                          <span className="block font-medium">{item.title}</span>
                          <span className="block text-muted-foreground">{item.detail}</span>
                        </Link>
                        {item.whatsApp ? (
                          <Button asChild variant="outline">
                            <a
                              href={item.whatsApp.url}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Remind ${item.title} on WhatsApp`}
                            >
                              <MessageCircle aria-hidden="true" />
                              Remind
                            </a>
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}

          <h2 className="mt-3 text-lg font-semibold">Recent activity</h2>
          {summary.activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {summary.activity.map((entry) => (
                <li key={entry.id} className="rounded-control bg-card px-3 py-2">
                  {entry.client ? (
                    <Link
                      href={`/app/clients/${entry.client.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {entry.client.fullName}
                    </Link>
                  ) : null}
                  {entry.client ? ": " : ""}
                  {describeActivity(entry)}
                  <span className="block text-xs text-muted-foreground">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
