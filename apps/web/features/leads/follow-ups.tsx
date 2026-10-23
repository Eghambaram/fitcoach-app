"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CONTACT_CHANNEL_LABELS,
  CONTACT_CHANNELS,
  CONTACT_NOTE_MAX,
  CONTACT_OUTCOME_LABELS,
  CONTACT_OUTCOMES,
  type CompleteFollowUpRequest,
  completeFollowUpRequestSchema,
  type ContactOutcome,
  FOLLOW_UP_ACTION_CHANNEL,
  FOLLOW_UP_ACTION_LABELS,
  FOLLOW_UP_ACTIONS,
  FOLLOW_UP_NOTE_MAX,
  type FollowUpInput,
  type FollowUpRequest,
  followUpRequestSchema,
  type FollowUpState,
  type LeadDetailResponse,
  type LeadFollowUp,
  type LogContactInput,
  type LogContactRequest,
  logContactRequestSchema,
  type MessageTemplatePurpose,
  type WhatsAppLink,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { AlarmClock, Clock, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useForm, type UseFormRegisterReturn, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog } from "@/components/shared/overlays";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Checkbox, Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError, applyFieldErrors } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------------------------
// Dates. Follow-up days are decided by the API in the workspace time zone; these only format.
// ---------------------------------------------------------------------------------------------

/** YYYY-MM-DD for a local date `offset` days from today. */
export function localDate(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return new Intl.DateTimeFormat("en-CA").format(date);
}

function formatTime(hhmm: string): string {
  const [hours = 0, minutes = 0] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(yyyymmdd: string): string {
  const [year = 2000, month = 1, day = 1] = yyyymmdd.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(year === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

/** "24 Oct, 10:00 am" — for history, where "today" would go stale. */
export function formatDue(dueDate: string, dueTime: string): string {
  return `${formatDate(dueDate)}, ${formatTime(dueTime)}`;
}

/** "Today, 6:30 pm", "Overdue · 20 Oct", "Tomorrow, 9:00 am", "24 Oct, 10:00 am". */
export function describeDue(dueDate: string, dueTime: string, state: FollowUpState | null): string {
  if (state === "today") return `Today, ${formatTime(dueTime)}`;
  if (state === "overdue") return `Overdue · ${formatDate(dueDate)}`;
  if (dueDate === localDate(1)) return `Tomorrow, ${formatTime(dueTime)}`;
  return `${formatDate(dueDate)}, ${formatTime(dueTime)}`;
}

/** The list's next follow-up cell: red with an alarm icon when due (§8.2); never colour alone. */
export function FollowUpWhen({
  at,
  state,
  className,
}: {
  at: string | null;
  state: FollowUpState | null;
  className?: string;
}) {
  if (!at) return <span className={cn("text-muted-foreground", className)}>Not scheduled</span>;
  const date = new Date(at);
  const due = state === "today" || state === "overdue";
  const dueDate = new Intl.DateTimeFormat("en-CA").format(date);
  const dueTime = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const Icon = due ? AlarmClock : Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        due ? "font-semibold text-danger" : "text-foreground",
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {describeDue(dueDate, dueTime, state)}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// WhatsApp click-to-chat (CLAUDE.md rule 20d): open the prefilled chat, then ask "Did you send it?".
// Nothing is logged unless the trainer says yes, and nothing claims the message was delivered.
// ---------------------------------------------------------------------------------------------

export function WhatsAppButton({
  link,
  name,
  onSent,
  pending = false,
  variant = "icon",
  className,
}: {
  link: WhatsAppLink | null;
  name: string;
  /** Without it (archived or converted leads) the chat just opens; nothing is asked or logged. */
  onSent?: (purpose: MessageTemplatePurpose) => void;
  pending?: boolean;
  variant?: "icon" | "wide" | "primary";
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  if (!link) return null;
  return (
    <>
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        onClick={() => setAsking(onSent !== undefined)}
        aria-label={variant === "icon" ? `WhatsApp ${name}` : undefined}
        className={cn(
          "flex items-center justify-center rounded-control",
          variant === "icon" && "size-11 border border-border bg-card hover:bg-muted",
          variant === "wide" &&
            "h-11 flex-1 gap-2 border border-border bg-card px-4 text-sm font-semibold hover:bg-muted",
          variant === "primary" &&
            "h-11 flex-1 gap-2 bg-lime px-4 text-sm font-semibold text-lime-foreground hover:bg-lime-hover",
          className,
        )}
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        {variant === "icon" ? null : "WhatsApp"}
      </a>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Did you send it?"
        description={
          <>
            We opened WhatsApp with this message for {name}. Log it only if you pressed Send.
            <span className="mt-3 block rounded-control bg-muted p-3 whitespace-pre-line text-foreground">
              {link.text}
            </span>
          </>
        }
        cancelLabel="Not sent"
        confirmLabel="Yes, I sent it"
        pending={pending}
        onConfirm={() => {
          setAsking(false);
          onSent?.(link.purpose);
        }}
      />
    </>
  );
}

/** Logs a WhatsApp message the trainer confirmed sending. */
export function useLogWhatsAppSent(leadId: string, onLogged: (lead: LeadDetailResponse) => void) {
  return useMutation({
    mutationFn: (templatePurpose: MessageTemplatePurpose) =>
      unwrap(
        browserApi.POST("/v1/leads/{id}/contacts", {
          params: { path: { id: leadId } },
          body: { channel: "whatsapp", outcome: "message_sent", templatePurpose },
        }),
      ),
    onSuccess: (lead) => {
      toast.success("WhatsApp message logged.");
      onLogged(lead);
    },
    onError: (failure) => toast.error(failure.message),
  });
}

// ---------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------

const FOLLOW_UP_FIELDS = ["actionType", "dueDate", "dueTime", "notes", "reminder"] as const;

type DueFields = "actionType" | "dueDate" | "dueTime";

function FollowUpFields({
  fields,
  errors,
}: {
  fields: Record<DueFields, UseFormRegisterReturn>;
  errors: Partial<Record<DueFields, string>>;
}) {
  return (
    <>
      <Field label="What to do" error={errors.actionType} required>
        <Select {...fields.actionType}>
          {FOLLOW_UP_ACTIONS.map((action) => (
            <option key={action} value={action}>
              {FOLLOW_UP_ACTION_LABELS[action]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" error={errors.dueDate} required>
          <Input type="date" min={localDate()} {...fields.dueDate} />
        </Field>
        <Field label="Time" error={errors.dueTime} required>
          <Input type="time" {...fields.dueTime} />
        </Field>
      </div>
    </>
  );
}

/** Schedule a follow-up, or change an open one. */
export function FollowUpForm({
  leadId,
  followUp,
  onSaved,
}: {
  leadId: string;
  followUp?: LeadFollowUp;
  onSaved: (lead: LeadDetailResponse) => void;
}) {
  const online = useOnline();
  const [problem, setProblem] = useState<string | null>(null);
  const form = useForm<FollowUpInput, unknown, FollowUpRequest>({
    resolver: zodResolver(followUpRequestSchema),
    defaultValues: followUp
      ? {
          actionType: followUp.actionType,
          dueDate: followUp.dueDate,
          dueTime: followUp.dueTime,
          notes: followUp.notes ?? "",
          reminder: followUp.reminder,
        }
      : {
          actionType: "whatsapp",
          dueDate: localDate(1),
          dueTime: "10:00",
          notes: "",
          reminder: "none",
        },
  });
  const { register, handleSubmit, formState, setError, setValue, control } = form;
  const reminder = useWatch({ control, name: "reminder" });

  const save = useMutation({
    mutationFn: (body: FollowUpRequest) =>
      unwrap(
        followUp
          ? browserApi.PATCH("/v1/leads/{id}/follow-ups/{followUpId}", {
              params: { path: { id: leadId, followUpId: followUp.id } },
              body,
            })
          : browserApi.POST("/v1/leads/{id}/follow-ups", {
              params: { path: { id: leadId } },
              body,
            }),
      ),
    onSuccess: (lead) => {
      toast.success(followUp ? "Follow-up updated." : "Follow-up scheduled.");
      onSaved(lead);
    },
    onError: (failure) => {
      if (failure instanceof ApiRequestError && failure.body.fieldErrors) {
        const unplaced = applyFieldErrors(failure, setError, FOLLOW_UP_FIELDS);
        setProblem(unplaced.length > 0 ? failure.message : null);
      } else {
        setProblem(failure.message);
      }
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((body) => {
        setProblem(null);
        save.mutate(body);
      })}
    >
      <FollowUpFields
        fields={{
          actionType: register("actionType"),
          dueDate: register("dueDate"),
          dueTime: register("dueTime"),
        }}
        errors={{
          actionType: formState.errors.actionType?.message,
          dueDate: formState.errors.dueDate?.message,
          dueTime: formState.errors.dueTime?.message,
        }}
      />
      <Field label="Notes (optional)" error={formState.errors.notes?.message}>
        <Textarea rows={2} maxLength={FOLLOW_UP_NOTE_MAX} {...register("notes")} />
      </Field>
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <Checkbox
          className="mt-0.5"
          checked={reminder === "in_app"}
          onChange={(event) => setValue("reminder", event.target.checked ? "in_app" : "none")}
        />
        <span>
          Remind me in the app when it&apos;s due
          <span className="block text-xs text-muted-foreground">
            Saved with the follow-up. In-app reminders start with notifications, coming soon.
          </span>
        </span>
      </label>
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="dark" loading={save.isPending} disabled={!online}>
        {followUp ? "Save follow-up" : "Schedule follow-up"}
      </Button>
    </form>
  );
}

type CompleteValues = {
  status: "done" | "skipped";
  outcome: ContactOutcome | "";
  outcomeNote: string;
  logContact: boolean;
  scheduleNext: boolean;
  next: { actionType: FollowUpRequest["actionType"]; dueDate: string; dueTime: string };
};

/** Done (how did it go?) or skipped, optionally logging the contact and booking the next one. */
export function CompleteFollowUpForm({
  leadId,
  followUp,
  sentTemplate,
  onSaved,
}: {
  leadId: string;
  followUp: LeadFollowUp;
  /** Set when the trainer just confirmed sending a WhatsApp message for this follow-up. */
  sentTemplate?: MessageTemplatePurpose;
  onSaved: (lead: LeadDetailResponse) => void;
}) {
  const online = useOnline();
  const [problem, setProblem] = useState<string | null>(null);
  const channel = FOLLOW_UP_ACTION_CHANNEL[followUp.actionType];
  const form = useForm<CompleteValues>({
    defaultValues: {
      status: "done",
      outcome: sentTemplate ? "message_sent" : "",
      outcomeNote: "",
      logContact: channel !== null,
      scheduleNext: true,
      next: { actionType: followUp.actionType, dueDate: localDate(2), dueTime: followUp.dueTime },
    },
  });
  const { register, handleSubmit, formState, setError, control } = form;
  const status = useWatch({ control, name: "status" });
  const scheduleNext = useWatch({ control, name: "scheduleNext" });

  const save = useMutation({
    mutationFn: (body: CompleteFollowUpRequest) =>
      unwrap(
        browserApi.POST("/v1/leads/{id}/follow-ups/{followUpId}/complete", {
          params: { path: { id: leadId, followUpId: followUp.id } },
          body,
        }),
      ),
    onSuccess: (lead) => {
      toast.success(status === "done" ? "Follow-up done." : "Follow-up skipped.");
      onSaved(lead);
    },
    onError: (failure) => {
      if (failure instanceof ApiRequestError && failure.body.fieldErrors) {
        const unplaced = applyFieldErrors(failure, setError, [
          "outcome",
          "outcomeNote",
          "next.actionType",
          "next.dueDate",
          "next.dueTime",
        ]);
        setProblem(unplaced.length > 0 ? failure.message : null);
      } else {
        setProblem(failure.message);
      }
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) => {
        setProblem(null);
        const parsed = completeFollowUpRequestSchema.safeParse({
          status: values.status,
          outcome: values.outcome || undefined,
          outcomeNote: values.outcomeNote,
          logContact: values.status === "done" && channel !== null && values.logContact,
          templatePurpose: sentTemplate,
          next: values.scheduleNext ? { ...values.next, reminder: "none" } : undefined,
        });
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            setError(issue.path.join(".") as keyof CompleteValues, { message: issue.message });
          }
          return;
        }
        save.mutate(parsed.data);
      })}
    >
      <fieldset className="flex gap-2">
        <legend className="sr-only">Result</legend>
        {(["done", "skipped"] as const).map((value) => (
          <label
            key={value}
            className={cn(
              "flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-control border px-3 text-sm font-semibold",
              status === value ? "border-charcoal bg-charcoal text-white" : "border-border bg-card",
            )}
          >
            <input type="radio" value={value} className="sr-only" {...register("status")} />
            {value === "done" ? "Done" : "Skip it"}
          </label>
        ))}
      </fieldset>
      <Field
        label={status === "done" ? "How did it go?" : "What happened? (optional)"}
        error={formState.errors.outcome?.message}
        required={status === "done"}
      >
        <Select {...register("outcome")}>
          <option value="">Choose an outcome</option>
          {CONTACT_OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {CONTACT_OUTCOME_LABELS[outcome]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note (optional)" error={formState.errors.outcomeNote?.message}>
        <Textarea rows={2} maxLength={FOLLOW_UP_NOTE_MAX} {...register("outcomeNote")} />
      </Field>
      {status === "done" && channel ? (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox {...register("logContact")} />
          Log it as a contact ({CONTACT_CHANNEL_LABELS[channel]})
        </label>
      ) : null}
      <div className="flex flex-col gap-3 rounded-control border border-border p-3">
        <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
          <Checkbox {...register("scheduleNext")} />
          Schedule the next follow-up
        </label>
        {scheduleNext ? (
          <FollowUpFields
            fields={{
              actionType: register("next.actionType"),
              dueDate: register("next.dueDate"),
              dueTime: register("next.dueTime"),
            }}
            errors={{
              actionType: formState.errors.next?.actionType?.message,
              dueDate: formState.errors.next?.dueDate?.message,
              dueTime: formState.errors.next?.dueTime?.message,
            }}
          />
        ) : null}
      </div>
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="dark" loading={save.isPending} disabled={!online}>
        {status === "done" ? "Mark done" : "Skip follow-up"}
      </Button>
    </form>
  );
}

/** "Log contact" (PROMPT §8.10): channel, outcome and an optional note. */
export function LogContactForm({
  leadId,
  onSaved,
}: {
  leadId: string;
  onSaved: (lead: LeadDetailResponse) => void;
}) {
  const online = useOnline();
  const [problem, setProblem] = useState<string | null>(null);
  const form = useForm<LogContactInput, unknown, LogContactRequest>({
    resolver: zodResolver(logContactRequestSchema),
    defaultValues: { channel: "call", outcome: undefined, note: "" },
  });
  const { register, handleSubmit, formState, setError } = form;
  const save = useMutation({
    mutationFn: (body: LogContactRequest) =>
      unwrap(
        browserApi.POST("/v1/leads/{id}/contacts", { params: { path: { id: leadId } }, body }),
      ),
    onSuccess: (lead) => {
      toast.success("Contact logged.");
      onSaved(lead);
    },
    onError: (failure) => {
      if (failure instanceof ApiRequestError && failure.body.fieldErrors) {
        const unplaced = applyFieldErrors(failure, setError, ["channel", "outcome", "note"]);
        setProblem(unplaced.length > 0 ? failure.message : null);
      } else {
        setProblem(failure.message);
      }
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((body) => {
        setProblem(null);
        save.mutate(body);
      })}
    >
      <Field label="Channel" error={formState.errors.channel?.message} required>
        <Select {...register("channel")}>
          {CONTACT_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {CONTACT_CHANNEL_LABELS[channel]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Outcome" error={formState.errors.outcome?.message} required>
        <Select defaultValue="" {...register("outcome")}>
          <option value="" disabled>
            Choose an outcome
          </option>
          {CONTACT_OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {CONTACT_OUTCOME_LABELS[outcome]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note (optional)" error={formState.errors.note?.message}>
        <Textarea rows={3} maxLength={CONTACT_NOTE_MAX} {...register("note")} />
      </Field>
      {problem ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="dark" loading={save.isPending} disabled={!online}>
        Log contact
      </Button>
    </form>
  );
}
