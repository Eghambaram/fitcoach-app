"use client";

import {
  type Appointment,
  APPOINTMENT_KIND_LABELS,
  APPOINTMENT_STATUS_LABELS,
  type AppointmentDetail,
  type AppointmentStatus,
  SESSION_NOTES_MAX,
} from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, MapPin, Repeat, RotateCcw, UserX, Video, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { Drawer, Modal } from "@/components/shared/overlays";
import { ErrorState, type PillTone, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { formatDateTime } from "../leads/lead-display";
import { CancelForm, RescheduleForm } from "./appointment-forms";
import { dayLabel, timeLabel } from "./dates";

const STATUS_TONES: Record<AppointmentStatus, PillTone> = {
  scheduled: "info",
  confirmed: "info",
  completed: "success",
  no_show: "warning",
  cancelled: "neutral",
};

export function AppointmentStatusPill({ appointment }: { appointment: Appointment }) {
  if (appointment.needsAttendance) return <StatusPill tone="danger">Mark attendance</StatusPill>;
  return (
    <StatusPill tone={STATUS_TONES[appointment.status]}>
      {APPOINTMENT_STATUS_LABELS[appointment.status]}
      {appointment.lateCancel ? " (late)" : ""}
    </StatusPill>
  );
}

function describeChange(change: AppointmentDetail["changes"][number]): string {
  const data = change.data;
  switch (change.kind) {
    case "created":
      return data.seriesId ? "Booked as part of a recurring series" : "Booked";
    case "rescheduled":
      return `Moved from ${String(data.from ?? "")} to ${String(data.to ?? "")}`;
    case "cancelled":
      return `Cancelled${data.lateCancel ? " (late)" : ""}: ${String(data.reason ?? "")}`;
    case "attendance":
      return `Marked ${APPOINTMENT_STATUS_LABELS[data.to as AppointmentStatus]?.toLowerCase() ?? String(data.to)}`;
    case "notes":
      return "Session notes updated";
  }
}

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

function NotesEditor({
  appointment,
  onChanged,
}: {
  appointment: AppointmentDetail;
  onChanged: (next: AppointmentDetail) => void;
}) {
  const online = useOnline();
  const [notes, setNotes] = useState(appointment.notes ?? "");
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.PUT("/v1/appointments/{id}/notes", {
          params: { path: { id: appointment.id } },
          body: { notes },
        }),
      ),
    onSuccess: (next) => {
      toast.success("Session notes saved.");
      onChanged(next);
    },
    onError: (failure) => toast.error(failure.message),
  });
  return (
    <div className="flex flex-col gap-2">
      <Field label="Session notes" hint="Only you can see these.">
        <Textarea
          rows={3}
          maxLength={SESSION_NOTES_MAX}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <Button
        variant="outline"
        className="self-end"
        loading={save.isPending}
        disabled={!online || notes === (appointment.notes ?? "")}
        onClick={() => save.mutate()}
      >
        Save notes
      </Button>
    </div>
  );
}

/** One appointment: details, attendance, reschedule, cancel, notes and history (§8.6). */
export function AppointmentDrawer({
  appointmentId,
  onClose,
  onChanged,
}: {
  appointmentId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<"reschedule" | "cancel" | null>(null);
  const query = useQuery({
    queryKey: ["appointment", appointmentId],
    queryFn: () =>
      unwrap(
        browserApi.GET("/v1/appointments/{id}", { params: { path: { id: appointmentId ?? "" } } }),
      ),
    enabled: appointmentId !== null,
    retry: false,
  });

  function changed(next: AppointmentDetail) {
    queryClient.setQueryData(["appointment", next.id], next);
    setModal(null);
    onChanged();
  }

  const attendance = useMutation({
    mutationFn: (status: "completed" | "no_show" | "scheduled") =>
      unwrap(
        browserApi.POST("/v1/appointments/{id}/attendance", {
          params: { path: { id: appointmentId ?? "" } },
          body: { status },
        }),
      ),
    onSuccess: (next) => {
      toast.success(
        next.status === "scheduled"
          ? "Attendance undone."
          : `Marked ${APPOINTMENT_STATUS_LABELS[next.status].toLowerCase()}.`,
      );
      changed(next);
    },
    onError: (failure) => toast.error(failure.message),
  });

  const appointment = query.data;
  const notFound = query.error instanceof ApiRequestError && query.error.status === 404;
  const live = appointment?.status === "scheduled" || appointment?.status === "confirmed";
  const started = appointment?.started ?? false;

  return (
    <Drawer
      open={appointmentId !== null}
      onOpenChange={(open) => (open ? null : onClose())}
      title={appointment ? appointment.person.fullName : "Appointment"}
    >
      {query.isPending && appointmentId ? (
        <p role="status" className="py-12 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      ) : notFound ? (
        <ErrorState
          title="Appointment not found"
          description="It may have been removed, or the link is wrong."
        />
      ) : query.isError ? (
        <ErrorState description="We couldn't load this appointment. Please try again." />
      ) : appointment ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={appointment.kind === "trial" ? "pink" : "neutral"}>
              {APPOINTMENT_KIND_LABELS[appointment.kind]}
            </StatusPill>
            <AppointmentStatusPill appointment={appointment} />
          </div>
          <div className="flex flex-col gap-2">
            <Row icon={<CalendarClock className="size-4" aria-hidden="true" />}>
              {dayLabel(appointment.date, "long")}, {timeLabel(appointment.startTime)} –{" "}
              {timeLabel(appointment.endTime)} ({appointment.durationMin} min)
            </Row>
            {appointment.location ? (
              <Row icon={<MapPin className="size-4" aria-hidden="true" />}>
                {appointment.location}
              </Row>
            ) : null}
            {appointment.meetingUrl ? (
              <Row icon={<Video className="size-4" aria-hidden="true" />}>
                <a
                  href={appointment.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {appointment.meetingUrl}
                </a>
              </Row>
            ) : null}
            {appointment.seriesId ? (
              <Row icon={<Repeat className="size-4" aria-hidden="true" />}>
                Part of a recurring series
              </Row>
            ) : null}
            {appointment.cancelReason ? (
              <Row icon={<X className="size-4" aria-hidden="true" />}>
                Cancelled: {appointment.cancelReason}
              </Row>
            ) : null}
            {appointment.person.kind === "lead" ? (
              <Link
                href={`/app/leads?lead=${appointment.person.id}`}
                className="text-sm font-semibold underline"
              >
                Open the lead
              </Link>
            ) : null}
          </div>

          {live ? (
            <div className="flex flex-col gap-2">
              {started ? (
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    loading={attendance.isPending && attendance.variables === "completed"}
                    disabled={!online || attendance.isPending}
                    onClick={() => attendance.mutate("completed")}
                  >
                    <Check aria-hidden="true" />
                    Attended
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    loading={attendance.isPending && attendance.variables === "no_show"}
                    disabled={!online || attendance.isPending}
                    onClick={() => attendance.mutate("no_show")}
                  >
                    <UserX aria-hidden="true" />
                    No-show
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Attendance can be marked once the session starts.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={!online}
                  onClick={() => setModal("reschedule")}
                >
                  Reschedule
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1"
                  disabled={!online}
                  onClick={() => setModal("cancel")}
                >
                  Cancel session
                </Button>
              </div>
            </div>
          ) : appointment.status === "completed" || appointment.status === "no_show" ? (
            <Button
              variant="ghost"
              className="self-start"
              loading={attendance.isPending}
              disabled={!online}
              onClick={() => attendance.mutate("scheduled")}
            >
              <RotateCcw aria-hidden="true" />
              Undo attendance
            </Button>
          ) : null}

          {appointment.status !== "cancelled" ? (
            <NotesEditor key={appointment.id} appointment={appointment} onChanged={changed} />
          ) : appointment.notes ? (
            <p className="whitespace-pre-line rounded-control border border-border p-3 text-sm">
              {appointment.notes}
            </p>
          ) : null}

          <section
            aria-labelledby="history"
            className="flex flex-col gap-2 border-t border-border pt-4"
          >
            <h3 id="history" className="text-sm font-semibold">
              History
            </h3>
            <ol className="flex flex-col gap-2">
              {appointment.changes.map((change) => (
                <li key={change.id} className="text-sm">
                  <p>{describeChange(change)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(change.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <Modal
            open={modal !== null}
            onOpenChange={(open) => (open ? null : setModal(null))}
            title={modal === "cancel" ? "Cancel session" : "Reschedule"}
            description={`${appointment.person.fullName} · ${dayLabel(appointment.date)} ${timeLabel(appointment.startTime)}`}
          >
            {modal === "reschedule" ? (
              <RescheduleForm appointment={appointment} onSaved={changed} />
            ) : null}
            {modal === "cancel" ? <CancelForm appointment={appointment} onSaved={changed} /> : null}
          </Modal>
        </div>
      ) : null}
    </Drawer>
  );
}
