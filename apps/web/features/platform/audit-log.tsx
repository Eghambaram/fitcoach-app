"use client";

import type { PlatformAuditEntry, PlatformAuditListResponse } from "@fitcoach/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FileClock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DataList, FilterBar } from "@/components/shared/data-list";
import { EmptyState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { useUrlQuery } from "@/lib/use-url-query";
import { formatDateTime } from "./format";

const ACTORS = ["platform_owner", "trainer", "client", "system", "cli"] as const;
const ACTOR_LABEL: Record<string, string> = {
  platform_owner: "Platform owner",
  trainer: "Trainer",
  client: "Client",
  system: "System",
  cli: "CLI",
};

/** The audit log (PROMPT §16.0): read-only, filterable, newest first, paged by cursor. */
export function AuditLog({
  initial,
  filters,
}: {
  initial: PlatformAuditListResponse;
  filters: { action?: string; actorKind?: (typeof ACTORS)[number]; workspaceId?: string };
}) {
  const { update } = useUrlQuery();
  const [action, setAction] = useState(filters.action ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((filters.action ?? "") !== action.trim()) update({ action: action.trim() });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  const pages = useInfiniteQuery({
    queryKey: ["platform-audit", filters],
    queryFn: ({ pageParam }) =>
      unwrap(
        browserApi.GET("/v1/platform/audit-logs", {
          params: { query: { ...filters, ...(pageParam ? { before: pageParam } : {}) } },
        }),
      ),
    initialPageParam: null as string | null,
    initialData: { pages: [initial], pageParams: [null] },
    getNextPageParam: (last) => last.nextCursor,
  });
  const rows = pages.data.pages.flatMap((page) => page.items);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        search={action}
        onSearchChange={setAction}
        searchLabel="Action, e.g. workspace.suspended"
      >
        <Select
          aria-label="Actor"
          value={filters.actorKind ?? ""}
          onChange={(event) => update({ actorKind: event.target.value })}
          className="sm:w-48"
        >
          <option value="">All actors</option>
          {ACTORS.map((actor) => (
            <option key={actor} value={actor}>
              {ACTOR_LABEL[actor]}
            </option>
          ))}
        </Select>
      </FilterBar>
      {filters.workspaceId ? (
        <p className="text-sm">
          One workspace only.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => update({ workspaceId: null })}
          >
            Show all
          </button>
        </p>
      ) : null}
      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileClock}
            title="No entries"
            description="Nothing matches these filters."
          />
        </Card>
      ) : (
        <DataList<PlatformAuditEntry>
          rows={rows}
          rowKey={(row) => row.id}
          caption="Audit log"
          cardTitle={(row) => <span className="font-mono text-sm">{row.action}</span>}
          columns={[
            { key: "time", header: "Time (IST)", cell: (row) => formatDateTime(row.occurredAt) },
            {
              key: "action",
              header: "Action",
              desktopOnly: true,
              cell: (row) => <span className="font-mono">{row.action}</span>,
            },
            {
              key: "actor",
              header: "Actor",
              cell: (row) =>
                `${ACTOR_LABEL[row.actorKind] ?? row.actorKind}${row.actorName ? ` · ${row.actorName}` : ""}`,
            },
            {
              key: "workspace",
              header: "Workspace",
              cell: (row) =>
                row.workspaceId ? (
                  <Link href={`/platform/trainers/${row.workspaceId}`} className="hover:underline">
                    {row.businessName ?? "Deleted workspace"}
                  </Link>
                ) : (
                  "—"
                ),
            },
            {
              key: "target",
              header: "Target",
              desktopOnly: true,
              cell: (row) => (row.targetType ? `${row.targetType}` : "—"),
            },
            { key: "reason", header: "Reason", cell: (row) => row.reason ?? "—" },
          ]}
        />
      )}
      {pages.hasNextPage ? (
        <div>
          <Button
            variant="outline"
            loading={pages.isFetchingNextPage}
            onClick={() => void pages.fetchNextPage()}
          >
            Load older entries
          </Button>
        </div>
      ) : null}
    </div>
  );
}
