"use client";

import {
  COACHING_MODE_LABELS,
  FITNESS_GOAL_LABELS,
  LEAD_NOTE_MAX,
  LEAD_SOURCE_LABELS,
  LEAD_STAGE_LABELS,
  type LeadActivity,
  type LeadDetailResponse,
  type LeadSource,
  type LeadStage,
  LOST_REASON_LABELS,
  LOST_REASONS,
  type LostReason,
  MANUAL_LEAD_STAGES,
  type ManualLeadStage,
} from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarPlus, Pencil, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Tabs } from "radix-ui";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import { ConfirmDialog, Drawer } from "@/components/shared/overlays";
import { ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { ApiRequestError } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { CopyButton } from "../settings/copy-button";
import { Avatar } from "../shell/app-shell";
import { ContactLinks, formatDateTime, formatDay, StagePill } from "./lead-display";
import { LeadForm } from "./lead-form";

const FIELD_LABELS: Record<string, string> = {
  fullName: "name",
  phoneE164: "phone",
  email: "email",
  goal: "goal",
  source: "source",
  trainingMode: "training mode",
  preferredSchedule: "preferred schedule",
  location: "location",
  interestedService: "interested in",
  referrer: "referrer",
  campaign: "campaign",
};

/** Plain-language timeline entry for each activity type (PROMPT §8.2 Activity tab). */
export function describeActivity(activity: LeadActivity): string {
  const data = activity.data;
  switch (activity.type) {
    case "enquiry_received":
      return `Enquiry received via ${LEAD_SOURCE_LABELS[data.source as LeadSource] ?? "the enquiry page"}`;
    case "created":
      return "Lead added";
    case "details_updated": {
      const fields = Array.isArray(data.fields) ? (data.fields as string[]) : [];
      return `Updated ${fields.map((field) => FIELD_LABELS[field] ?? field).join(", ") || "details"}`;
    }
    case "stage_changed": {
      const to = LEAD_STAGE_LABELS[data.to as LeadStage] ?? String(data.to);
      const from = LEAD_STAGE_LABELS[data.from as LeadStage] ?? String(data.from);
      const reason = data.lostReason
        ? ` (${LOST_REASON_LABELS[data.lostReason as LostReason]})`
        : "";
      return `Stage changed from ${from} to ${to}${reason}`;
    }
    case "archived":
      return "Archived";
    case "restored":
      return "Restored from the archive";
    case "note":
      return "Note added";
  }
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">
        {children ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

function StageControl({
  lead,
  onChanged,
}: {
  lead: LeadDetailResponse;
  onChanged: (lead: LeadDetailResponse) => void;
}) {
  const online = useOnline();
  const [stage, setStage] = useState<ManualLeadStage | "">("");
  const [reason, setReason] = useState<LostReason | "">("");
  const [nurtureUntil, setNurtureUntil] = useState("");
  const [error, setError] = useState<string | null>(null);

  const change = useMutation({
    mutationFn: (body: {
      stage: ManualLeadStage;
      lostReason?: LostReason;
      nurtureUntil?: string;
    }) =>
      unwrap(browserApi.POST("/v1/leads/{id}/stage", { params: { path: { id: lead.id } }, body })),
    onSuccess: (saved) => {
      setStage("");
      setReason("");
      setNurtureUntil("");
      setError(null);
      toast.success(`Stage changed to ${LEAD_STAGE_LABELS[saved.stage]}.`);
      onChanged(saved);
    },
    onError: (failure) =>
      setError(
        failure instanceof ApiRequestError && failure.body.fieldErrors?.lostReason
          ? (failure.body.fieldErrors.lostReason[0] ?? failure.message)
          : failure.message,
      ),
  });

  if (lead.stage === "converted") {
    return <p className="text-sm text-muted-foreground">This lead is now a client.</p>;
  }

  function apply(next: ManualLeadStage) {
    if (next === "lost") {
      setStage("lost");
      return;
    }
    change.mutate({ stage: next });
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Stage">
        <Select
          value={stage === "lost" ? "lost" : lead.stage}
          disabled={!online || change.isPending}
          onChange={(event) => apply(event.target.value as ManualLeadStage)}
        >
          {MANUAL_LEAD_STAGES.map((option) => (
            <option key={option} value={option}>
              {LEAD_STAGE_LABELS[option]}
            </option>
          ))}
        </Select>
      </Field>
      {stage === "lost" ? (
        <div className="flex flex-col gap-3 rounded-control border border-border p-3">
          <Field label="Why was it lost?" error={error ?? undefined} required>
            <Select
              value={reason}
              onChange={(event) => setReason(event.target.value as LostReason)}
            >
              <option value="" disabled>
                Choose a reason
              </option>
              {LOST_REASONS.map((option) => (
                <option key={option} value={option}>
                  {LOST_REASON_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Try again after (optional)">
            <Input
              type="date"
              value={nurtureUntil}
              onChange={(event) => setNurtureUntil(event.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStage("")}>
              Cancel
            </Button>
            <Button
              variant="dark"
              loading={change.isPending}
              disabled={!online}
              onClick={() => {
                if (!reason) {
                  setError("Choose why the lead was lost");
                  return;
                }
                change.mutate({
                  stage: "lost",
                  lostReason: reason,
                  nurtureUntil: nurtureUntil || undefined,
                });
              }}
            >
              Mark lost
            </Button>
          </div>
        </div>
      ) : null}
      {error && stage !== "lost" ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function NotesTab({
  lead,
  onChanged,
}: {
  lead: LeadDetailResponse;
  onChanged: (lead: LeadDetailResponse) => void;
}) {
  const online = useOnline();
  const [body, setBody] = useState("");
  const add = useMutation({
    mutationFn: () =>
      unwrap(
        browserApi.POST("/v1/leads/{id}/notes", {
          params: { path: { id: lead.id } },
          body: { body },
        }),
      ),
    onSuccess: (saved) => {
      setBody("");
      onChanged(saved);
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
          hint="Private — only you can see notes. Notes can't be edited later."
        >
          <Textarea
            rows={3}
            maxLength={LEAD_NOTE_MAX}
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
      {lead.notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lead.notes.map((note) => (
            <li key={note.id} className="rounded-control bg-muted p-3 text-sm">
              <p className="whitespace-pre-line">{note.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadBody({
  lead,
  onChanged,
  onOpenLead,
  onDeleted,
}: {
  lead: LeadDetailResponse;
  onChanged: (lead: LeadDetailResponse) => void;
  onOpenLead: (id: string) => void;
  onDeleted: () => void;
}) {
  const online = useOnline();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const archive = useMutation({
    mutationFn: (archived: boolean) =>
      unwrap(
        archived
          ? browserApi.POST("/v1/leads/{id}/archive", { params: { path: { id: lead.id } } })
          : browserApi.POST("/v1/leads/{id}/restore", { params: { path: { id: lead.id } } }),
      ),
    onSuccess: (saved) => {
      toast.success(saved.archived ? "Lead archived." : "Lead restored.");
      onChanged(saved);
    },
    onError: (failure) => toast.error(failure.message),
  });
  const remove = useMutation({
    mutationFn: () =>
      unwrap(browserApi.DELETE("/v1/leads/{id}", { params: { path: { id: lead.id } } })),
    onSuccess: () => {
      toast.success("Lead deleted.");
      onDeleted();
    },
    onError: (failure) => {
      setConfirmDelete(false);
      toast.error(failure.message);
    },
  });

  const summary = [
    FITNESS_GOAL_LABELS[lead.goal],
    lead.trainingMode ? COACHING_MODE_LABELS[lead.trainingMode] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar name={lead.fullName} className="size-14 text-lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StagePill stage={lead.stage} />
            {lead.archived ? (
              <span className="text-xs font-semibold text-muted-foreground">Archived</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <ContactLinks name={lead.fullName} phone={lead.phoneE164} size="lg" />
      </div>

      <Tabs.Root defaultValue="overview" className="flex flex-col gap-4">
        <Tabs.List aria-label="Lead details" className="flex border-b border-border">
          {[
            ["overview", "Overview"],
            ["activity", "Activity"],
            ["notes", `Notes${lead.notes.length ? ` (${lead.notes.length})` : ""}`],
          ].map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value ?? ""}
              className="-mb-px min-h-11 flex-1 border-b-2 border-transparent text-sm font-medium text-muted-foreground data-[state=active]:border-charcoal data-[state=active]:text-foreground"
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview" className="flex flex-col gap-5">
          {editing ? (
            <LeadForm
              lead={lead}
              onOpenLead={onOpenLead}
              onSaved={(saved) => {
                setEditing(false);
                toast.success("Lead updated.");
                onChanged(saved);
              }}
            />
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Lead information</h3>
                  <Button
                    variant="ghost"
                    disabled={!online || lead.stage === "converted"}
                    onClick={() => setEditing(true)}
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                </div>
                <dl className="divide-y divide-border">
                  <Info label="Phone">
                    {lead.phoneE164 ? (
                      <span className="flex items-center gap-2">
                        {lead.phoneE164}
                        <CopyButton
                          value={lead.phoneE164}
                          label="Copy"
                          aria-label="Copy phone number"
                        />
                      </span>
                    ) : null}
                  </Info>
                  <Info label="Email">
                    {lead.email ? (
                      <span className="flex items-center gap-2">
                        <span className="truncate">{lead.email}</span>
                        <CopyButton value={lead.email} label="Copy" aria-label="Copy email" />
                      </span>
                    ) : null}
                  </Info>
                  <Info label="Main goal">{FITNESS_GOAL_LABELS[lead.goal]}</Info>
                  <Info label="Training mode">
                    {lead.trainingMode ? COACHING_MODE_LABELS[lead.trainingMode] : null}
                  </Info>
                  <Info label="Source">{LEAD_SOURCE_LABELS[lead.source]}</Info>
                  <Info label="Enquiry date">{formatDateTime(lead.createdAt)}</Info>
                  <Info label="Preferred time">{lead.preferredSchedule}</Info>
                  <Info label="Location">{lead.location}</Info>
                  <Info label="Interested in">{lead.interestedService}</Info>
                  <Info label="Referred by">{lead.referrer}</Info>
                  <Info label="Campaign">{lead.campaign}</Info>
                  {lead.lostReason ? (
                    <Info label="Lost because">{LOST_REASON_LABELS[lead.lostReason]}</Info>
                  ) : null}
                  {lead.nurtureUntil ? (
                    <Info label="Try again after">{lead.nurtureUntil}</Info>
                  ) : null}
                </dl>
              </div>
              {lead.message ? (
                <blockquote className="rounded-control bg-muted p-3 text-sm">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Their message</p>
                  <p className="whitespace-pre-line">{lead.message}</p>
                </blockquote>
              ) : null}
              <StageControl lead={lead} onChanged={onChanged} />
              {lead.consent ? (
                <details className="rounded-control border border-border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Consent given {formatDay(lead.consent.consentedAt)} (form version{" "}
                    {lead.consent.version})
                  </summary>
                  <p className="mt-2 text-muted-foreground">“{lead.consent.text}”</p>
                </details>
              ) : null}
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  variant="ghost"
                  disabled={!online}
                  loading={archive.isPending}
                  onClick={() => archive.mutate(!lead.archived)}
                >
                  {lead.archived ? (
                    <RotateCcw aria-hidden="true" />
                  ) : (
                    <Archive aria-hidden="true" />
                  )}
                  {lead.archived ? "Restore" : "Archive"}
                </Button>
                {lead.canDelete ? (
                  <Button variant="ghost" disabled={!online} onClick={() => setConfirmDelete(true)}>
                    <Trash2 aria-hidden="true" />
                    Delete
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </Tabs.Content>

        <Tabs.Content value="activity">
          <ol className="flex flex-col gap-3">
            {lead.activities.map((activity) => (
              <li key={activity.id} className="flex gap-3 text-sm">
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-charcoal"
                  aria-hidden="true"
                />
                <div>
                  <p>{describeActivity(activity)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(activity.createdAt)} ·{" "}
                    {activity.actorKind === "system" ? "Enquiry page" : "You"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Tabs.Content>

        <Tabs.Content value="notes">
          <NotesTab lead={lead} onChanged={onChanged} />
        </Tabs.Content>
      </Tabs.Root>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${lead.fullName}?`}
        description="This removes the lead completely. It can't be undone."
        confirmLabel="Delete lead"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

/** The lead drawer (PROMPT §8.2): right drawer on desktop, full screen on mobile, deep-linkable. */
export function LeadDrawer({
  leadId,
  onClose,
  onOpenLead,
}: {
  leadId: string | null;
  onClose: () => void;
  onOpenLead: (id: string) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () =>
      unwrap(browserApi.GET("/v1/leads/{id}", { params: { path: { id: leadId ?? "" } } })),
    enabled: leadId !== null,
    retry: false,
  });

  function changed(lead: LeadDetailResponse) {
    queryClient.setQueryData(["lead", lead.id], lead);
    // The list, tab counts and KPIs are server-rendered; refresh them too.
    router.refresh();
  }

  const lead = query.data;
  const notFound = query.error instanceof ApiRequestError && query.error.status === 404;

  return (
    <Drawer
      open={leadId !== null}
      onOpenChange={(open) => (open ? null : onClose())}
      title={lead?.fullName ?? "Lead"}
      footer={
        lead && lead.stage !== "converted" ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button variant="outline" disabled className={cn("flex-1")}>
                <CalendarPlus aria-hidden="true" />
                Book trial
              </Button>
              <Button disabled className="flex-1">
                <UserPlus aria-hidden="true" />
                Convert to client
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Booking trials and converting leads are coming soon.
            </p>
          </div>
        ) : undefined
      }
    >
      {query.isPending && leadId ? (
        <p role="status" className="py-12 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      ) : notFound ? (
        <ErrorState
          title="Lead not found"
          description="It may have been deleted, or the link is wrong."
        />
      ) : query.isError ? (
        <ErrorState description="We couldn't load this lead. Please try again." />
      ) : lead ? (
        <LeadBody
          lead={lead}
          onChanged={changed}
          onOpenLead={onOpenLead}
          onDeleted={() => {
            onClose();
            router.refresh();
          }}
        />
      ) : null}
    </Drawer>
  );
}
