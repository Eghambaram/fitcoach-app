import { platformTrainerQuerySchema, type PlatformTrainer } from "@fitcoach/shared";
import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DataList } from "@/components/shared/data-list";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState, StatusPill } from "@/components/shared/status";
import { Card } from "@/components/ui/card";
import { formatDate, formatRelative, WORKSPACE_STATUS } from "@/features/platform/format";
import { TrainerFilters } from "@/features/platform/trainer-filters";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Trainers" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Trainer accounts (PROMPT §16.0): search and filter; counts only, no client details. */
export default async function PlatformTrainersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = await searchParams;
  const parsed = platformTrainerQuerySchema.safeParse({
    q: first(raw.q) || undefined,
    status: first(raw.status) || undefined,
    sort: first(raw.sort) || undefined,
  });
  const query = parsed.success ? parsed.data : { sort: "newest" as const };
  const api = await serverApi();
  const { data } = await api.GET("/v1/platform/trainers", { params: { query } });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Trainers" description="Every trainer workspace in the beta." />
      <TrainerFilters />
      {!data ? (
        <Card>
          <ErrorState description="We couldn't load trainers. Please try again." />
        </Card>
      ) : data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={query.q || query.status ? "No trainers match" : "No trainers yet"}
            description={
              query.q || query.status
                ? "Try another search or status."
                : "Create a beta invite code in Settings and share it."
            }
          />
        </Card>
      ) : (
        <>
          <DataList<PlatformTrainer>
            rows={data.items}
            rowKey={(row) => row.workspaceId}
            caption="Trainers"
            cardTitle={(row) => (
              <Link href={`/platform/trainers/${row.workspaceId}`} className="hover:underline">
                {row.businessName}
              </Link>
            )}
            columns={[
              {
                key: "business",
                header: "Business",
                desktopOnly: true,
                cell: (row) => (
                  <Link
                    href={`/platform/trainers/${row.workspaceId}`}
                    className="font-semibold hover:underline"
                  >
                    {row.businessName}
                  </Link>
                ),
              },
              {
                key: "owner",
                header: "Trainer",
                cell: (row) => (
                  <span className="block min-w-0">
                    <span className="block">{row.ownerName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.ownerEmail ?? "No email"}
                    </span>
                  </span>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (row) => (
                  <StatusPill tone={WORKSPACE_STATUS[row.status].tone}>
                    {WORKSPACE_STATUS[row.status].label}
                  </StatusPill>
                ),
              },
              { key: "clients", header: "Active clients", cell: (row) => row.activeClients },
              { key: "joined", header: "Joined", cell: (row) => formatDate(row.createdAt) },
              {
                key: "active",
                header: "Last active",
                cell: (row) => formatRelative(row.lastActiveAt),
              },
            ]}
          />
          {data.items.length >= data.limit ? (
            <p className="text-sm text-muted-foreground">
              Showing the first {data.limit}. Search to narrow the list.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
