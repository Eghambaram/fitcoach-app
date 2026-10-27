import {
  APPOINTMENT_KIND_LABELS,
  APPOINTMENT_STATUS_LABELS,
  type ClientAppointment,
  type ClientPortalPackage,
  type ClientWorkoutSummary,
  WORKOUT_SESSION_STATUS_LABELS,
  type WorkoutSessionStatus,
} from "@fitcoach/shared";
import { MapPin, MessageCircle, Phone, Video } from "lucide-react";
import Link from "next/link";
import { type PillTone, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { buildWhatsAppUrl } from "@fitcoach/shared";
import { dayLabel, timeLabel } from "../calendar/dates";

const WORKOUT_TONES: Record<WorkoutSessionStatus, PillTone> = {
  planned: "info",
  in_progress: "warning",
  completed: "success",
  skipped: "neutral",
};

export function WorkoutStatusPill({ status }: { status: WorkoutSessionStatus }) {
  return (
    <StatusPill tone={WORKOUT_TONES[status]}>{WORKOUT_SESSION_STATUS_LABELS[status]}</StatusPill>
  );
}

/** Start / Continue only when the client may log; otherwise View. */
export function workoutAction(
  workout: ClientWorkoutSummary,
  canLog: boolean,
  today: string,
): string {
  if (workout.status === "in_progress") return canLog ? "Continue" : "View";
  if (workout.status === "planned" && canLog && workout.scheduledOn <= today) return "Start";
  return "View";
}

export function TrainerAvatar({
  name,
  url,
  size = 48,
}: {
  name: string;
  url: string | null;
  size?: number;
}) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- public-bucket photo, already resized by the API
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-full object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-lime font-bold text-lime-foreground"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** One of the client's sessions: day, time, kind and where (no trainer notes exist here). */
export function AppointmentRow({ appointment }: { appointment: ClientAppointment }) {
  const online = appointment.kind === "online_session";
  const cancelled = appointment.status === "cancelled";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {dayLabel(appointment.date, "long")} · {timeLabel(appointment.startTime)}–
          {timeLabel(appointment.endTime)}
        </p>
        {appointment.status !== "scheduled" ? (
          <StatusPill
            tone={cancelled ? "neutral" : appointment.status === "completed" ? "success" : "info"}
          >
            {APPOINTMENT_STATUS_LABELS[appointment.status]}
          </StatusPill>
        ) : null}
      </div>
      <p className="flex items-center gap-1 text-sm text-muted-foreground">
        {online ? (
          <Video className="size-4" aria-hidden="true" />
        ) : (
          <MapPin className="size-4" aria-hidden="true" />
        )}
        {APPOINTMENT_KIND_LABELS[appointment.kind]}
        {appointment.location ? ` · ${appointment.location}` : ""}
      </p>
      {appointment.meetingUrl && !cancelled ? (
        <a
          href={appointment.meetingUrl}
          target="_blank"
          rel="noreferrer"
          className="w-fit text-sm font-semibold underline underline-offset-2"
        >
          Join online session
        </a>
      ) : null}
    </div>
  );
}

/** Sessions left and expiry only (CLAUDE.md rule 20c). */
export function packageLine(pkg: ClientPortalPackage, today: string): string {
  const expired = pkg.expiresOn !== null && pkg.expiresOn < today;
  const expiry = pkg.expiresOn
    ? `${expired ? "expired" : "valid until"} ${dayLabel(pkg.expiresOn)}`
    : "no expiry date";
  return pkg.sessionsLeft !== null
    ? `${pkg.sessionsLeft} of ${pkg.sessionsIncluded ?? pkg.sessionsLeft} sessions left · ${expiry}`
    : `${pkg.name} · ${expiry}`;
}

/** "Contact trainer" (client board 10 → WhatsApp and call, no in-app chat). */
export function ContactTrainerButtons({ phone, name }: { phone: string | null; name: string }) {
  if (!phone) {
    return (
      <p className="text-sm text-muted-foreground">{name} hasn&apos;t added a phone number yet.</p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button asChild variant="outline">
        <a href={buildWhatsAppUrl(phone, "")} target="_blank" rel="noreferrer">
          <MessageCircle aria-hidden="true" />
          WhatsApp
        </a>
      </Button>
      <Button asChild variant="outline">
        <a href={`tel:${phone}`}>
          <Phone aria-hidden="true" />
          Call
        </a>
      </Button>
    </div>
  );
}

export function WorkoutLink({
  workout,
  canLog,
  today,
}: {
  workout: ClientWorkoutSummary;
  canLog: boolean;
  today: string;
}) {
  return (
    <Link
      href={`/client/workouts/${workout.id}`}
      className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-charcoal"
    >
      <span className="flex flex-col">
        <span className="font-medium">{workout.name}</span>
        <span className="text-muted-foreground">{dayLabel(workout.scheduledOn, "long")}</span>
      </span>
      <span className="flex items-center gap-2">
        {workout.status !== "planned" ? <WorkoutStatusPill status={workout.status} /> : null}
        <span className="font-semibold">{workoutAction(workout, canLog, today)}</span>
      </span>
    </Link>
  );
}
