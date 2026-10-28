import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquareText,
  PauseCircle,
  UserCheck,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { KpiCard, PageHeader } from "@/components/shared/page-header";
import {
  EmptyState,
  ErrorState,
  NotConfiguredNotice,
  StatusPill,
} from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { formatDate, WORKSPACE_STATUS } from "@/features/platform/format";
import { ApproveButton } from "@/features/platform/trainer-actions";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Platform overview" };

/** Real counts only (PROMPT §16.0, board 01 #2 adjusted): no revenue, MRR or plan charts. */
export default async function PlatformOverviewPage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/platform/overview");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform overview"
        description="Trainers, activation and platform health."
      />
      <NotConfiguredNotice
        name="Billing"
        description="The beta is free, so there are no revenue figures until billing is set up (v1.1)."
      />
      {!data ? (
        <Card>
          <ErrorState description="We couldn't load the overview. Please try again." />
        </Card>
      ) : (
        <>
          <section aria-label="Key numbers" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Trainers"
              value={data.trainers.total}
              caption={`${data.trainers.activeThisWeek} signed in this week`}
              icon={Users}
              href="/platform/trainers"
            />
            <KpiCard
              label="Pending approval"
              value={data.trainers.pendingApproval}
              icon={Clock}
              href="/platform/trainers?status=pending_approval"
            />
            <KpiCard
              label="Suspended"
              value={data.trainers.suspended}
              icon={PauseCircle}
              href="/platform/trainers?status=suspended"
            />
            <KpiCard
              label="Active clients"
              value={data.activeClients}
              caption="All workspaces"
              icon={UserCheck}
            />
            <KpiCard
              label="Activation rate"
              value={
                data.activation.rate === null ? "—" : `${Math.round(data.activation.rate * 100)}%`
              }
              caption={
                data.activation.eligible === 0
                  ? "No trainer has been here 7 days yet"
                  : `${data.activation.activated} of ${data.activation.eligible} trainers past day 7`
              }
              icon={CheckCircle2}
            />
            <KpiCard label="Client invites accepted" value={data.invitesAccepted} icon={Activity} />
            <KpiCard
              label="Feedback to review"
              value={data.feedbackOpen}
              icon={MessageSquareText}
              href="/platform/feedback"
            />
            <KpiCard
              label="Failed jobs (24 h)"
              value={data.failedJobs24h}
              icon={AlertTriangle}
              href="/platform/health"
            />
          </section>
          <p className="text-xs text-muted-foreground">
            Activation: within 7 days of signup, public page published, at least 3 clients onboarded
            and a program assigned (PROMPT §1A.5).
          </p>

          <section aria-labelledby="signups-title" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 id="signups-title" className="text-lg font-semibold">
                Recent trainer signups
              </h2>
              <Link
                href="/platform/trainers"
                className="text-sm font-medium underline underline-offset-2"
              >
                All trainers
              </Link>
            </div>
            {data.recentSignups.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Users}
                  title="No trainers yet"
                  description="Create a beta invite code in Settings and share it."
                />
              </Card>
            ) : (
              <Card>
                <ul className="divide-y divide-border">
                  {data.recentSignups.map((signup) => (
                    <li key={signup.workspaceId} className="flex flex-wrap items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/platform/trainers/${signup.workspaceId}`}
                          className="font-semibold hover:underline"
                        >
                          {signup.businessName}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {signup.ownerName} · joined {formatDate(signup.createdAt)}
                        </p>
                      </div>
                      <StatusPill tone={WORKSPACE_STATUS[signup.status].tone}>
                        {WORKSPACE_STATUS[signup.status].label}
                      </StatusPill>
                      {signup.status === "pending_approval" ? (
                        <ApproveButton
                          workspaceId={signup.workspaceId}
                          name={signup.businessName}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}
    </div>
  );
}
