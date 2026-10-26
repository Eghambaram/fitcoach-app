"use client";

import {
  APPOINTMENT_KIND_LABELS,
  buildWhatsAppUrl,
  CLIENT_NOTE_MAX,
  type ClientAction,
  type ClientDetail,
  COACHING_MODE_LABELS,
  EXPERIENCE_LEVEL_LABELS,
  FITNESS_GOAL_LABELS,
  fromCm,
  fromKg,
  PREFERRED_CONTACT_LABELS,
} from "@fitcoach/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Archive,
  CalendarPlus,
  ClipboardCheck,
  Dumbbell,
  LineChart,
  MessageCircle,
  Package,
  PauseCircle,
  Phone,
  PlayCircle,
  RotateCcw,
  Target,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs } from "radix-ui";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog, Modal } from "@/components/shared/overlays";
import { EmptyState, ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { AppointmentStatusPill } from "../calendar/appointment-drawer";
import { AppointmentForm } from "../calendar/appointment-forms";
import { dayLabel, timeLabel } from "../calendar/dates";
import { formatDateTime } from "../leads/lead-display";
import { Avatar } from "../shell/app-shell";
import { ClientStatusPill } from "./client-display";

const TABS = [
  ["overview", "Overview"],
  ["packages", "Packages"],
  ["workouts", "Workouts"],
  ["schedule", "Schedule"],
  ["check-ins", "Check-ins"],
  ["progress", "Progress"],
  ["notes", "Notes"],
] as const;
type TabValue = (typeof TABS)[number][0];

function describeActivity(entry: ClientDetail["recentActivity"][number]): string {
  const data = entry.data;
  const reason = typeof data.reason === "string" ? `: ${data.reason}` : "";
  switch (entry.type) {
    case "lead_converted":
      return data.linked ? "Linked from a new enquiry" : "Converted from a lead";
    case "client_onboarded":
      return "Onboarding completed";
    case "client_paused":
      return `Paused${reason}`;
    case "client_resumed":
      return "Resumed";
    case "client_archived":
      return `Archived${reason}`;
    case "client_restored":
      return "Restored from the archive";
    case "session_attended":
    case "session_no_show": {
      const when =
        typeof data.date === "string" && typeof data.startTime === "string"
          ? ` on ${dayLabel(data.date)}, ${timeLabel(data.startTime)}`
          : "";
      return `${entry.type === "session_attended" ? "Attended" : "Missed"} a session${when}`;
    }
  }
}

function measurementLabel(
  measurement: ClientDetail["measurements"][number],
  units: ClientDetail["units"],
): string {
  if (measurement.unitKind === "mass")
    return `${fromKg(measurement.value, units.weightUnit)} ${units.weightUnit}`;
  if (measurement.unitKind === "length")
    return `${fromCm(measurement.value, units.lengthUnit)} ${units.lengthUnit}`;
  if (measurement.unitKind === "percent") return `${measurement.value}%`;
  return String(measurement.value);
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">
        {children || <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-2xl font-semibold">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </Card>
  );
}

/** Tabs whose feature ships later: say what will be here, never show sample data (§7.3). */
function Later({
  icon,
  title,
  description,
}: {
  icon: typeof Package;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <EmptyState icon={icon} title={title} description={description} />
    </Card>
  );
}

function Schedule({ client }: { client: ClientDetail }) {
  const query = useQuery({
    queryKey: ["client-schedule", client.id],
    queryFn: () =>
      unwrap(browserApi.GET("/v1/clients/{id}/schedule", { params: { path: { id: client.id } } })),
  });
  if (query.isPending)
    return (
      <p role="status" className="py-8 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    );
  if (query.isError || !query.data)
    return <ErrorState description="We couldn't load the schedule." />;
  const { upcoming, past } = query.data;
  if (upcoming.length === 0 && past.length === 0) {
    return (
      <EmptyState
        icon={CalendarPlus}
        title="No sessions yet"
        description="Book a session to see it here."
      />
    );
  }
  const list = (items: typeof upcoming) => (
    <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-card">
      {items.map((appointment) => (
        <li key={appointment.id}>
          <Link
            href={`/app/calendar?appt=${appointment.id}&date=${appointment.date}`}
            className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted"
          >
            <span>
              <span className="font-medium">
                {dayLabel(appointment.date)}, {timeLabel(appointment.startTime)}
              </span>{" "}
              · {APPOINTMENT_KIND_LABELS[appointment.kind]} · {appointment.durationMin} min
            </span>
            <AppointmentStatusPill appointment={appointment} />
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="upcoming" className="flex flex-col gap-2">
        <h3 id="upcoming" className="font-semibold">
          Upcoming
        </h3>
        {upcoming.length ? (
          list(upcoming)
        ) : (
          <p className="text-sm text-muted-foreground">Nothing booked.</p>
        )}
      </section>
      <section aria-labelledby="past" className="flex flex-col gap-2">
        <h3 id="past" className="font-semibold">
          Recent
        </h3>
        {past.length ? (
          list(past)
        ) : (
          <p className="text-sm text-muted-foreground">No past sessions.</p>
        )}
      </section>
    </div>
  );
}

function Notes({
  client,
  onChanged,
}: {
  client: ClientDetail;
  onChanged: (next: ClientDetail) => void;
}) {
  const online = useOnline();
  const [body, setBody] = useState("");
  const add = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.POST("/v1/clients/{id}/notes", {
          params: { path: { id: client.id } },
          body: { body },
        }),
      ),
    onSuccess: (next) => {
      setBody("");
      onChanged(next);
    },
    onError: (failure) => toast.error(failure.message),
  });
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <Field
          label="Add a note"
          hint="Private: only you can see notes. They can't be edited later."
        >
          <Textarea
            rows={3}
            maxLength={CLIENT_NOTE_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <Button
          type="submit"
          variant="dark"
          className="self-end"
          loading={add.isPending}
          disabled={!online || !body.trim()}
        >
          Save note
        </Button>
      </form>
      {client.notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {client.notes.map((note) => (
            <li key={note.id} className="rounded-control border border-border bg-card p-3 text-sm">
              <p className="whitespace-pre-line">{note.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ACTION_COPY: Record<
  ClientAction,
  { label: string; title: string; description: string; confirm: string }
> = {
  pause: {
    label: "Pause",
    title: "Pause this client?",
    description: "Use this for a break. Their sessions and history stay; you can resume any time.",
    confirm: "Pause client",
  },
  resume: {
    label: "Resume",
    title: "Resume this client?",
    description: "They become active again.",
    confirm: "Resume",
  },
  archive: {
    label: "Archive",
    title: "Archive this client?",
    description:
      "Their upcoming sessions are cancelled and their app access ends. All history, notes and measurements are kept, and you can restore them later.",
    confirm: "Archive client",
  },
  restore: {
    label: "Restore",
    title: "Restore this client?",
    description: "They return to your active clients (or to onboarding if they never finished it).",
    confirm: "Restore",
  },
};

/** Client profile (PROMPT §8.3, Client Profile board). Tab is in the URL (`?tab=`). */
export function ClientDetailScreen({ initial }: { initial: ClientDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const online = useOnline();
  const [client, setClient] = useState(initial);
  const [booking, setBooking] = useState(false);
  const [action, setAction] = useState<ClientAction | null>(null);
  const [reason, setReason] = useState("");
  const tab = (
    TABS.some(([value]) => value === params.get("tab")) ? params.get("tab") : "overview"
  ) as TabValue;

  const changeStatus = useMutation({
    mutationFn: (next: ClientAction) =>
      unwrap(
        browserApi.POST("/v1/clients/{id}/status", {
          params: { path: { id: client.id } },
          body: { action: next, reason: reason.trim() || undefined },
        }),
      ),
    onSuccess: (next) => {
      setAction(null);
      setReason("");
      setClient(next);
      toast.success(
        `${next.fullName} is now ${next.status === "onboarding_draft" ? "onboarding" : next.status}.`,
      );
      router.refresh();
    },
    onError: (failure) => {
      setAction(null);
      toast.error(failure.message);
    },
  });

  const primary = client.goals.find((goal) => goal.kind === "primary");
  const secondary = client.goals.filter((goal) => goal.kind === "secondary");
  const archived = client.status === "archived";
  const actions: ClientAction[] =
    client.status === "active"
      ? ["pause", "archive"]
      : client.status === "paused"
        ? ["resume", "archive"]
        : client.status === "archived"
          ? ["restore"]
          : ["archive"];
  const summary = [
    client.trainingMode ? COACHING_MODE_LABELS[client.trainingMode] : null,
    client.age !== null ? `${client.age} years` : null,
    client.location,
    client.timezone,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/app/clients" className="self-start text-sm font-medium underline">
        All clients
      </Link>
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <Avatar name={client.fullName} className="size-16 text-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{client.fullName}</h1>
            <ClientStatusPill status={client.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((next) => {
            const Icon = {
              pause: PauseCircle,
              resume: PlayCircle,
              archive: Archive,
              restore: RotateCcw,
            }[next];
            return (
              <Button key={next} variant="ghost" disabled={!online} onClick={() => setAction(next)}>
                <Icon aria-hidden="true" />
                {ACTION_COPY[next].label}
              </Button>
            );
          })}
        </div>
      </Card>

      {client.status === "onboarding_draft" ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-info-soft p-4 text-sm"
        >
          <span>
            Onboarding isn&apos;t finished: goals, baseline and consent are still to come.
          </span>
          {client.onboardingLink ? (
            <Button variant="dark" asChild>
              <Link href={client.onboardingLink}>Finish onboarding</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      {archived ? (
        <p role="status" className="rounded-card bg-muted p-4 text-sm">
          Archived {client.archivedAt ? formatDateTime(client.archivedAt) : ""}. Everything is kept;
          restore to coach them again.
        </p>
      ) : null}

      {/* Quick actions (§8.3): book, WhatsApp, call, note. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button variant="outline" disabled={!online || archived} onClick={() => setBooking(true)}>
          <CalendarPlus aria-hidden="true" />
          Book session
        </Button>
        {client.phoneE164 ? (
          <>
            <Button variant="outline" asChild>
              <a href={buildWhatsAppUrl(client.phoneE164, "")} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden="true" />
                WhatsApp
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`tel:${client.phoneE164}`}>
                <Phone aria-hidden="true" />
                Call
              </a>
            </Button>
          </>
        ) : null}
        <Button
          variant="outline"
          onClick={() => router.replace(`${pathname}?tab=notes`, { scroll: false })}
        >
          Add note
        </Button>
      </div>

      <Tabs.Root
        value={tab}
        onValueChange={(value) => router.replace(`${pathname}?tab=${value}`, { scroll: false })}
        className="flex flex-col gap-4"
      >
        <Tabs.List aria-label="Client" className="flex overflow-x-auto border-b border-border">
          {TABS.map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className="-mb-px min-h-11 shrink-0 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground data-[state=active]:border-charcoal data-[state=active]:text-foreground"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="flex flex-col gap-5">
          <Card className="flex items-start gap-3 p-5">
            <Target className="mt-0.5 size-6 text-success" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-medium text-muted-foreground">Primary goal</h2>
              <p className="text-lg font-semibold">
                {primary ? FITNESS_GOAL_LABELS[primary.goal] : "Not set yet"}
              </p>
              {primary?.targetText ? <p className="text-sm">{primary.targetText}</p> : null}
              {secondary.length > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  Also: {secondary.map((goal) => FITNESS_GOAL_LABELS[goal.goal]).join(", ")}
                </p>
              ) : null}
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat value={client.stats.weeksWithYou ?? "—"} label="Weeks with you" />
            <Stat value={client.stats.sessionsCompleted} label="Sessions completed" />
            <Stat
              value={
                client.stats.nextAppointment ? (
                  <Link
                    href={`/app/calendar?appt=${client.stats.nextAppointment.id}&date=${client.stats.nextAppointment.date}`}
                    className="text-base underline"
                  >
                    {dayLabel(client.stats.nextAppointment.date)},{" "}
                    {timeLabel(client.stats.nextAppointment.startTime)}
                  </Link>
                ) : (
                  "—"
                )
              }
              label="Next session"
            />
          </div>

          <Card className="flex flex-col gap-2 p-5">
            <h2 className="font-semibold">Latest measurements</h2>
            {client.measurements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No measurements yet.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {client.measurements.map((measurement) => (
                  <div key={measurement.key}>
                    <dt className="text-xs text-muted-foreground">{measurement.name}</dt>
                    <dd className="font-semibold">{measurementLabel(measurement, client.units)}</dd>
                    <dd className="text-xs text-muted-foreground">
                      {dayLabel(measurement.measuredOn)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-2 font-semibold">Details</h2>
              <dl className="divide-y divide-border">
                <Detail label="Phone">{client.phoneE164}</Detail>
                <Detail label="Email">{client.email}</Detail>
                <Detail label="Contact by">
                  {client.preferredContact
                    ? PREFERRED_CONTACT_LABELS[client.preferredContact]
                    : null}
                </Detail>
                <Detail label="Preferred times">{client.preferredSchedule}</Detail>
                <Detail label="Experience">
                  {client.experienceLevel ? EXPERIENCE_LEVEL_LABELS[client.experienceLevel] : null}
                </Detail>
                <Detail label="Equipment">{client.equipment}</Detail>
                <Detail label="Started">
                  {client.coachingStartOn ? dayLabel(client.coachingStartOn) : null}
                </Detail>
                <Detail label="Limitations">{client.limitations}</Detail>
                <Detail label="Emergency contact">
                  {client.emergencyContact
                    ? [
                        client.emergencyContact.name,
                        client.emergencyContact.relation,
                        client.emergencyContact.phone,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : null}
                </Detail>
                <Detail label="Consent">
                  {client.consents.length
                    ? client.consents
                        .map(
                          (consent) =>
                            `${consent.kind === "data_processing" ? "Data processing" : "Progress photos"}: ${consent.status} (v${consent.noticeVersion})`,
                        )
                        .join("; ")
                    : null}
                </Detail>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                Limitations and emergency contact are only visible to you.
              </p>
            </Card>
            <Card className="p-5">
              <h2 className="mb-2 font-semibold">Recent activity</h2>
              {client.recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing yet.</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {client.recentActivity.map((entry, index) => (
                    <li key={`${entry.type}-${entry.at}-${index}`} className="text-sm">
                      <p>{describeActivity(entry)}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        </Tabs.Content>

        <Tabs.Content value="packages">
          <Later
            icon={Package}
            title="Packages are coming next"
            description="The package they bought, sessions left, expiry and payments you record will show here."
          />
        </Tabs.Content>
        <Tabs.Content value="workouts">
          <Later
            icon={Dumbbell}
            title="Programs and workouts are coming soon"
            description="The program you assign and the workouts they log will show here."
          />
        </Tabs.Content>
        <Tabs.Content value="schedule">
          <Schedule client={client} />
        </Tabs.Content>
        <Tabs.Content value="check-ins">
          <Later
            icon={ClipboardCheck}
            title="Check-ins are coming soon"
            description="Their self-reported check-ins (feeling, energy, sleep, soreness) will show here."
          />
        </Tabs.Content>
        <Tabs.Content value="progress" className="flex flex-col gap-3">
          {client.measurements.length === 0 ? (
            <Later
              icon={LineChart}
              title="No measurements yet"
              description="Baseline measurements from onboarding show here. Charts and adding new measurements are coming soon."
            />
          ) : (
            <Card className="p-5">
              <h2 className="mb-3 font-semibold">Latest measurements</h2>
              <table className="w-full text-sm">
                <caption className="sr-only">Latest measurements</caption>
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th scope="col" className="py-1 font-medium">
                      Measurement
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      Latest
                    </th>
                    <th scope="col" className="py-1 font-medium">
                      Measured
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {client.measurements.map((measurement) => (
                    <tr key={measurement.key}>
                      <td className="py-2">{measurement.name}</td>
                      <td className="py-2 font-semibold">
                        {measurementLabel(measurement, client.units)}
                      </td>
                      <td className="py-2">{dayLabel(measurement.measuredOn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                Charts and new measurements are coming soon.
              </p>
            </Card>
          )}
        </Tabs.Content>
        <Tabs.Content value="notes">
          <Notes client={client} onChanged={setClient} />
        </Tabs.Content>
      </Tabs.Root>

      <Modal
        open={booking}
        onOpenChange={setBooking}
        title="Book a session"
        description={client.fullName}
      >
        {booking ? (
          <AppointmentForm
            clientId={client.id}
            defaultDate={new Intl.DateTimeFormat("en-CA", { timeZone: client.timezone }).format(
              new Date(),
            )}
            onSaved={(appointment) => {
              setBooking(false);
              toast.success("Session booked.");
              router.push(`/app/calendar?appt=${appointment.id}&date=${appointment.date}`);
            }}
          />
        ) : null}
      </Modal>

      <ConfirmDialog
        open={action !== null}
        onOpenChange={(open) => (open ? null : setAction(null))}
        title={action ? ACTION_COPY[action].title : ""}
        description={
          action ? (
            <>
              {ACTION_COPY[action].description}
              {action === "pause" || action === "archive" ? (
                <span className="mt-3 block">
                  <Field label="Reason (optional)">
                    <Input
                      maxLength={200}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field>
                </span>
              ) : null}
            </>
          ) : (
            ""
          )
        }
        confirmLabel={action ? ACTION_COPY[action].confirm : ""}
        destructive={action === "archive"}
        pending={changeStatus.isPending}
        onConfirm={() => (action ? changeStatus.mutate(action) : null)}
      />
    </div>
  );
}
