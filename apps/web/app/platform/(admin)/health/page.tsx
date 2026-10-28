import type { HealthItem } from "@fitcoach/shared";
import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState, StatusPill } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { formatBytes, formatDateTime, HEALTH_STATUS } from "@/features/platform/format";
import { RunBackupButton } from "@/features/platform/run-backup-button";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "System health" };
export const dynamic = "force-dynamic";

function Check({
  title,
  item,
  children,
}: {
  title: string;
  item: HealthItem;
  children?: React.ReactNode;
}) {
  const status = HEALTH_STATUS[item.status];
  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      <p className="text-sm text-muted-foreground">{item.detail}</p>
      {children}
    </Card>
  );
}

/** System health (PROMPT §16.0): each check OK / Degraded / Unknown — never assumed healthy. */
export default async function PlatformHealthPage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/platform/health");
  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="System health" />
        <Card>
          <ErrorState description="We couldn't run the health checks. The API may be down." />
        </Card>
      </div>
    );
  }
  const budget = data.storageBudget;
  const share =
    budget.usedBytes !== null && budget.hardLimitBytes
      ? Math.min(100, Math.round((budget.usedBytes / budget.hardLimitBytes) * 100))
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="System health"
        description={`Checked ${formatDateTime(data.checkedAt)} (IST).`}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Check title="Database" item={data.database} />
        <Check title="Background jobs" item={data.jobs} />
        <Check title="Backups" item={data.backups}>
          {data.canRunBackup ? (
            <div>
              <RunBackupButton />
            </div>
          ) : null}
        </Check>
        <Check title="Email" item={data.email} />
        <Check title="File storage (R2)" item={data.storage} />
        <Check title="Storage used" item={budget}>
          {share !== null &&
          budget.usedBytes !== null &&
          budget.budgetBytes !== null &&
          budget.hardLimitBytes !== null ? (
            <>
              <div
                role="meter"
                aria-label="Storage used of the hard limit"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={share}
                className="h-2 rounded-full bg-muted"
              >
                <div
                  className={`h-2 rounded-full ${budget.status === "ok" ? "bg-success" : "bg-danger"}`}
                  style={{ width: `${share}%` }}
                />
              </div>
              <p className="text-sm">
                {formatBytes(budget.usedBytes)} used · budget {formatBytes(budget.budgetBytes)} ·
                hard limit {formatBytes(budget.hardLimitBytes)}
              </p>
            </>
          ) : null}
        </Check>
      </div>
      <section aria-labelledby="failed-title" className="flex flex-col gap-3">
        <h2 id="failed-title" className="text-lg font-semibold">
          Failed jobs in the last 24 hours
        </h2>
        {data.failedJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {data.failedJobs.map((job) => (
                <li key={`${job.name}-${job.startedAt}`} className="p-4 text-sm">
                  <p className="font-mono font-semibold">{job.name}</p>
                  <p className="text-muted-foreground">{formatDateTime(job.startedAt)}</p>
                  {job.error ? <p className="mt-1 break-words">{job.error}</p> : null}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
