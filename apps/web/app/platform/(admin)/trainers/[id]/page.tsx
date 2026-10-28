import { CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, StatusPill } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import {
  formatDate,
  formatDateTime,
  formatRelative,
  WORKSPACE_STATUS,
} from "@/features/platform/format";
import { TrainerActions } from "@/features/platform/trainer-actions";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Trainer" };

const CHECKLIST = [
  ["publicPagePublished", "Public page published"],
  ["hasLeadOrClient", "First lead or client added"],
  ["programAssigned", "A program assigned"],
  ["clientInvited", "A client invited to the app"],
] as const;

/** One trainer (PROMPT §16.0): checklist, plan, usage counts and the audited actions. */
export default async function PlatformTrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await serverApi();
  const { data, response } = await api.GET("/v1/platform/trainers/{id}", {
    params: { path: { id } },
  });

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <Link
          href="/platform/trainers"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Trainers
        </Link>
        <Card>
          <ErrorState
            title={
              response.status === 404 || response.status === 400 ? "Trainer not found" : undefined
            }
            description={
              response.status === 404 || response.status === 400
                ? "This workspace doesn't exist."
                : "We couldn't load this trainer. Please try again."
            }
          />
        </Card>
      </div>
    );
  }

  const status = WORKSPACE_STATUS[data.status];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/platform/trainers"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Trainers
        </Link>
        <PageHeader
          className="mt-2"
          title={data.businessName}
          description={`${data.ownerName} · ${data.ownerEmail ?? "no email"}${data.emailVerified ? "" : " (not verified)"}`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <span>Joined {formatDate(data.createdAt)}</span>
          <span>· Last active {formatRelative(data.lastActiveAt)}</span>
          {data.city ? <span>· {data.city}</span> : null}
        </div>
      </div>

      <TrainerActions trainer={data} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-semibold">Getting started</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {CHECKLIST.map(([key, label]) => (
              <li key={key} className="flex items-center gap-2">
                {data.checklist[key] ? (
                  <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
                <span>{label}</span>
                <span className="sr-only">{data.checklist[key] ? "(done)" : "(not yet)"}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Plan</h2>
          {data.plan ? (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Plan</dt>
              <dd>{data.plan.planName}</dd>
              <dt className="text-muted-foreground">Client limit</dt>
              <dd>{data.plan.maxActiveClients} active</dd>
              <dt className="text-muted-foreground">Trial ends</dt>
              <dd>
                {data.plan.trialEndsAt ? formatDateTime(data.plan.trialEndsAt) : "No trial end"}
              </dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No plan assigned.</p>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold">Usage</h2>
          <p className="text-xs text-muted-foreground">Counts only — no client details.</p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            {(
              [
                ["Leads", data.usage.leads],
                ["Clients", data.usage.clients],
                ["Active clients", data.activeClients],
                ["Sessions booked", data.usage.appointments],
                ["Workouts logged", data.usage.workouts],
                ["Signed-in devices", data.activeSessions],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
      <Link
        href={`/platform/audit-logs?workspaceId=${data.workspaceId}`}
        className="text-sm font-medium underline underline-offset-2"
      >
        See this workspace&apos;s audit log
      </Link>
    </div>
  );
}
