"use client";

import {
  CLIENT_ATTENTION_FILTERS,
  CLIENT_ATTENTION_LABELS,
  CLIENT_SORT_LABELS,
  CLIENT_SORTS,
  CLIENT_STATUS_LABELS,
  type ClientListItem,
  type ClientListResponse,
  type ClientStatus,
  COACHING_MODE_LABELS,
  COACHING_MODES,
  FITNESS_GOAL_LABELS,
  FITNESS_GOALS,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { type DataColumn, DataList, FilterBar } from "@/components/shared/data-list";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { useUrlQuery } from "@/lib/use-url-query";
import { dayLabel, timeLabel } from "../calendar/dates";
import { Avatar } from "../shell/app-shell";
import { ClientStatusPill } from "./client-display";
import { CLIENT_PARAMS } from "./client-params";

const TAB_ORDER: ClientStatus[] = ["active", "paused", "archived"];

/** Clients list (PROMPT §8.3): status tabs with counts, search, filters, sort; cards on phones. */
export function ClientsScreen({ list }: { list: ClientListResponse }) {
  const params = useSearchParams();
  const { update, pending } = useUrlQuery();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [extra, setExtra] = useState<{
    base: ClientListResponse;
    items: ClientListItem[];
    cursor: string | null;
  }>();
  const more = extra?.base === list ? extra.items : [];
  const cursor = extra?.base === list ? extra.cursor : list.nextCursor;
  const status = (params.get("status") as ClientStatus | null) ?? "active";

  useEffect(() => {
    if ((params.get("q") ?? "") === search.trim()) return;
    const timer = setTimeout(() => update({ q: search.trim() || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `update` reads the latest params on each call
  }, [search]);

  const loadMore = useMutation({
    mutationFn: () => {
      const query = Object.fromEntries(
        CLIENT_PARAMS.map((name) => [name, params.get(name) ?? undefined]).filter(([, v]) => v),
      );
      return unwrap(
        browserApi.GET("/v1/clients", {
          params: { query: { ...query, cursor: cursor ?? undefined } as never },
        }),
      );
    },
    onSuccess: (page) =>
      setExtra({ base: list, items: [...more, ...page.items], cursor: page.nextCursor }),
  });

  const rows = [...list.items, ...more];
  const total = Object.values(list.counts).reduce((sum, count) => sum + count, 0);
  const filtered = CLIENT_PARAMS.some(
    (name) => name !== "status" && name !== "sort" && params.get(name),
  );
  // The onboarding tab only appears while someone is being onboarded.
  const tabs: ClientStatus[] =
    list.counts.onboarding_draft > 0 || status === "onboarding_draft"
      ? [...TAB_ORDER, "onboarding_draft"]
      : TAB_ORDER;

  const name = (client: ClientListItem) => (
    <Link
      href={`/app/clients/${client.id}`}
      className="flex min-h-11 items-center gap-3 font-semibold hover:underline"
    >
      <Avatar name={client.fullName} className="size-9 text-sm" />
      {client.fullName}
    </Link>
  );
  const columns: DataColumn<ClientListItem>[] = [
    { key: "name", header: "Name", cell: name, desktopOnly: true },
    { key: "goal", header: "Goal", cell: (c) => (c.goal ? FITNESS_GOAL_LABELS[c.goal] : "—") },
    {
      key: "mode",
      header: "Mode",
      cell: (c) => (c.trainingMode ? COACHING_MODE_LABELS[c.trainingMode] : "—"),
      desktopOnly: true,
    },
    { key: "status", header: "Status", cell: (c) => <ClientStatusPill status={c.status} /> },
    {
      key: "next",
      header: "Next session",
      cell: (c) =>
        c.nextSession
          ? `${dayLabel(c.nextSession.date)}, ${timeLabel(c.nextSession.startTime)}`
          : "Not booked",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clients"
        description="Everyone you coach, in one place."
        actions={
          <Button asChild>
            <Link href="/app/clients/new">
              <UserPlus aria-hidden="true" />
              Add client
            </Link>
          </Button>
        }
      />

      {total === 0 && !filtered ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Convert a lead, or add a client you already coach."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/app/clients/new">Add client</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/app/leads">Go to leads</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <FilterBar
            tabs={tabs.map((value) => ({
              value,
              label: CLIENT_STATUS_LABELS[value],
              count: list.counts[value],
            }))}
            activeTab={status}
            onTabChange={(value) => update({ status: value === "active" ? null : value })}
            search={search}
            onSearchChange={setSearch}
            searchLabel="Search by name, phone or email"
          >
            <Select
              aria-label="Goal"
              value={params.get("goal") ?? ""}
              onChange={(event) => update({ goal: event.target.value })}
              className="sm:w-44"
            >
              <option value="">All goals</option>
              {FITNESS_GOALS.map((goal) => (
                <option key={goal} value={goal}>
                  {FITNESS_GOAL_LABELS[goal]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Training mode"
              value={params.get("mode") ?? ""}
              onChange={(event) => update({ mode: event.target.value })}
              className="sm:w-40"
            >
              <option value="">All modes</option>
              {COACHING_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {COACHING_MODE_LABELS[mode]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Package"
              value={params.get("attention") ?? ""}
              onChange={(event) => update({ attention: event.target.value })}
              className="sm:w-48"
            >
              <option value="">All packages</option>
              {CLIENT_ATTENTION_FILTERS.map((attention) => (
                <option key={attention} value={attention}>
                  {CLIENT_ATTENTION_LABELS[attention]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Sort"
              value={params.get("sort") ?? "name"}
              onChange={(event) =>
                update({ sort: event.target.value === "name" ? null : event.target.value })
              }
              className="sm:w-40"
            >
              {CLIENT_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {CLIENT_SORT_LABELS[sort]}
                </option>
              ))}
            </Select>
          </FilterBar>

          <div
            aria-busy={pending}
            className={pending ? "opacity-60 transition-opacity" : undefined}
          >
            {rows.length === 0 ? (
              <EmptyState
                title={
                  filtered
                    ? "No clients match"
                    : `No ${CLIENT_STATUS_LABELS[status].toLowerCase()} clients`
                }
                description={filtered ? "Try another search or filter." : undefined}
              />
            ) : (
              <DataList
                rows={rows}
                columns={columns}
                rowKey={(c) => c.id}
                caption="Clients"
                cardTitle={name}
              />
            )}
          </div>
          {cursor ? (
            <Button
              variant="outline"
              className="self-center"
              loading={loadMore.isPending}
              onClick={() => loadMore.mutate()}
            >
              Load more
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
