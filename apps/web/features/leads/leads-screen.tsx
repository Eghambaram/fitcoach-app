"use client";

import {
  COACHING_MODE_LABELS,
  COACHING_MODES,
  FITNESS_GOAL_LABELS,
  LEAD_FOLLOW_UP_FILTER_LABELS,
  LEAD_FOLLOW_UP_FILTERS,
  LEAD_SORT_LABELS,
  LEAD_SORTS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LEAD_STAGE_LABELS,
  LEAD_STAGES,
  type LeadListItem,
  type LeadListResponse,
  type LeadsSummaryResponse,
} from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import {
  AlarmClock,
  CalendarClock,
  Download,
  Globe2,
  Inbox,
  Plus,
  Share2,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { type DataColumn, DataList, FilterBar } from "@/components/shared/data-list";
import { useOnline } from "@/components/shared/offline-banner";
import { Drawer, Modal } from "@/components/shared/overlays";
import { KpiCard, PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Checkbox, Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { useUrlQuery } from "@/lib/use-url-query";
import { FollowUpForm, FollowUpWhen, useLogWhatsAppSent, WhatsAppButton } from "./follow-ups";
import { CallLink, formatDay, StagePill } from "./lead-display";
import { LeadDrawer } from "./lead-drawer";
import { LeadForm } from "./lead-form";
import { LEAD_PARAMS } from "./lead-params";

/** Row WhatsApp: logs the message only after "Yes, I sent it", and only for open leads. */
function RowWhatsApp({ lead }: { lead: LeadListItem }) {
  const router = useRouter();
  const sent = useLogWhatsAppSent(lead.id, () => router.refresh());
  const loggable = !lead.archived && lead.stage !== "converted";
  return (
    <WhatsAppButton
      link={lead.whatsApp}
      name={lead.fullName}
      pending={sent.isPending}
      onSent={loggable ? (purpose) => sent.mutate(purpose) : undefined}
    />
  );
}

export function LeadsScreen({
  list,
  summary,
}: {
  list: LeadListResponse;
  summary: LeadsSummaryResponse;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const online = useOnline();
  const { update, pending } = useUrlQuery({ clearValues: ["all"] });
  const [search, setSearch] = useState(params.get("q") ?? "");
  // Pages added by "Load more", tagged with the first page they extend: when the filters change,
  // the server sends a new first page and the old extra pages no longer apply.
  const [extra, setExtra] = useState<{
    base: LeadListResponse;
    items: LeadListItem[];
    cursor: string | null;
  }>();
  const more = extra?.base === list ? extra.items : [];
  const cursor = extra?.base === list ? extra.cursor : list.nextCursor;
  const [adding, setAdding] = useState(false);
  const [scheduling, setScheduling] = useState<LeadListItem | null>(null);

  const openLead = params.get("lead");
  const stage = params.get("stage") ?? "all";
  const filtered = LEAD_PARAMS.some((name) => name !== "sort" && params.get(name));

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    if ((params.get("q") ?? "") === search.trim()) return;
    const timer = setTimeout(() => update({ q: search.trim() || null }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `update` reads the latest params on each call
  }, [search]);

  const loadMore = useMutation({
    mutationFn: () => {
      const query = Object.fromEntries(
        LEAD_PARAMS.map((name) => [name, params.get(name) ?? undefined]).filter(
          ([, value]) => value,
        ),
      );
      return unwrap(
        browserApi.GET("/v1/leads", {
          params: { query: { ...query, cursor: cursor ?? undefined } as never },
        }),
      );
    },
    onSuccess: (page) => {
      setExtra({ base: list, items: [...more, ...page.items], cursor: page.nextCursor });
    },
  });

  const rows = [...list.items, ...more];
  const exportQuery = new URLSearchParams(
    LEAD_PARAMS.filter((name) => name !== "sort" && params.get(name)).map((name) => [
      name,
      params.get(name) ?? "",
    ]),
  ).toString();

  const nameButton = (lead: LeadListItem) => (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => update({ lead: lead.id })}
        className="min-h-11 text-left font-semibold hover:underline"
      >
        {lead.fullName}
      </button>
      {lead.followUpState === "overdue" ? (
        <span className="size-2 rounded-full bg-danger" aria-hidden="true" />
      ) : null}
    </span>
  );
  const canFollowUp = (lead: LeadListItem) => !lead.archived && lead.stage !== "converted";

  const columns: DataColumn<LeadListItem>[] = [
    { key: "name", header: "Name", cell: nameButton, desktopOnly: true },
    { key: "goal", header: "Goal", cell: (lead) => FITNESS_GOAL_LABELS[lead.goal] },
    { key: "source", header: "Source", cell: (lead) => LEAD_SOURCE_LABELS[lead.source] },
    {
      key: "mode",
      header: "Mode",
      cell: (lead) => (lead.trainingMode ? COACHING_MODE_LABELS[lead.trainingMode] : "—"),
      desktopOnly: true,
    },
    { key: "stage", header: "Stage", cell: (lead) => <StagePill stage={lead.stage} /> },
    {
      key: "nextFollowUp",
      header: "Next follow-up",
      cell: (lead) => <FollowUpWhen at={lead.nextFollowUpAt} state={lead.followUpState} />,
    },
    {
      key: "lastContact",
      header: "Last contact",
      cell: (lead) => (lead.lastContactAt ? formatDay(lead.lastContactAt) : "—"),
      desktopOnly: true,
    },
    {
      key: "added",
      header: "Added",
      cell: (lead) => formatDay(lead.createdAt),
      desktopOnly: true,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (lead) => (
        <div className="flex gap-1">
          <CallLink name={lead.fullName} phone={lead.phoneE164} />
          <RowWhatsApp lead={lead} />
          {canFollowUp(lead) ? (
            <Button
              variant="outline"
              size="icon"
              aria-label={`Schedule a follow-up with ${lead.fullName}`}
              disabled={!online}
              onClick={() => setScheduling(lead)}
            >
              <CalendarClock aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const empty = summary.stageCounts.all === 0 && !filtered;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads"
        description="Capture, track and convert more clients."
        actions={
          <>
            <Button disabled={!online} onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
              Add lead
            </Button>
            <Button variant="outline" asChild>
              <Link href="/app/settings/public-page/share">
                <Share2 aria-hidden="true" />
                Share enquiry page
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Open leads"
          value={summary.kpis.open}
          caption="New, contacted, trial booked or interested"
          icon={Users}
        />
        <KpiCard
          label="New this week"
          value={summary.kpis.newThisWeek}
          caption="Since Monday"
          icon={UserPlus}
        />
        <KpiCard
          label="Follow-ups due"
          value={summary.kpis.followUpsDue}
          caption={
            summary.kpis.followUpsOverdue > 0
              ? `${summary.kpis.followUpsOverdue} overdue`
              : "Today or earlier"
          }
          icon={AlarmClock}
        />
        <KpiCard
          label="Upcoming trials"
          value={summary.kpis.upcomingTrials}
          caption="Booked from today on"
          icon={CalendarClock}
        />
        <KpiCard
          label="From your page"
          value={summary.kpis.fromPublicPage30Days}
          caption="Enquiries, last 30 days"
          icon={Globe2}
        />
      </div>

      {empty ? (
        <EmptyState
          icon={Inbox}
          title="No leads yet"
          description="Add someone you've spoken to, or share your enquiry page so people can reach you."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setAdding(true)} disabled={!online}>
                <Plus aria-hidden="true" />
                Add lead
              </Button>
              <Button variant="outline" asChild>
                <Link href="/app/settings/public-page/share">Share enquiry page</Link>
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <FilterBar
            tabs={[
              { value: "all", label: "All leads", count: summary.stageCounts.all },
              ...LEAD_STAGES.map((value) => ({
                value,
                label: LEAD_STAGE_LABELS[value],
                count: summary.stageCounts[value],
              })),
            ]}
            activeTab={stage}
            onTabChange={(value) => update({ stage: value })}
            search={search}
            onSearchChange={setSearch}
            searchLabel="Search by name, phone, email, goal or source"
          >
            <Select
              aria-label="Source"
              value={params.get("source") ?? ""}
              onChange={(event) => update({ source: event.target.value })}
              className="sm:w-40"
            >
              <option value="">All sources</option>
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {LEAD_SOURCE_LABELS[source]}
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
              aria-label="Follow-up"
              value={params.get("followUp") ?? ""}
              onChange={(event) => update({ followUp: event.target.value })}
              className="sm:w-48"
            >
              <option value="">Any follow-up</option>
              {LEAD_FOLLOW_UP_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {LEAD_FOLLOW_UP_FILTER_LABELS[filter]}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Sort"
              value={params.get("sort") ?? "next_follow_up"}
              onChange={(event) =>
                update({
                  sort: event.target.value === "next_follow_up" ? null : event.target.value,
                })
              }
              className="sm:w-44"
            >
              {LEAD_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {LEAD_SORT_LABELS[sort]}
                </option>
              ))}
            </Select>
          </FilterBar>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <label className="flex min-h-11 items-center gap-2">
              <Checkbox
                checked={params.get("archived") === "true"}
                onChange={(event) => update({ archived: event.target.checked ? "true" : null })}
              />
              Show archived leads
            </label>
            <Button variant="ghost" asChild>
              <a href={`/api/v1/leads/export.csv${exportQuery ? `?${exportQuery}` : ""}`} download>
                <Download aria-hidden="true" />
                Export CSV
              </a>
            </Button>
          </div>

          <div
            aria-busy={pending}
            className={pending ? "opacity-60 transition-opacity" : undefined}
          >
            {rows.length === 0 ? (
              <EmptyState title="No leads match" description="Try another tab, search or filter." />
            ) : (
              <DataList
                rows={rows}
                columns={columns}
                rowKey={(lead) => lead.id}
                caption="Leads"
                cardTitle={nameButton}
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

      <Drawer
        open={adding}
        onOpenChange={setAdding}
        title="Add lead"
        description="Someone who asked about coaching."
      >
        {adding ? (
          <LeadForm
            onOpenLead={(id) => {
              setAdding(false);
              update({ lead: id });
            }}
            onSaved={(lead) => {
              setAdding(false);
              update({ lead: lead.id });
            }}
          />
        ) : null}
      </Drawer>

      <Modal
        open={scheduling !== null}
        onOpenChange={(open) => (open ? null : setScheduling(null))}
        title="Schedule a follow-up"
        description={scheduling?.fullName}
      >
        {scheduling ? (
          <FollowUpForm
            leadId={scheduling.id}
            onSaved={() => {
              setScheduling(null);
              router.refresh();
            }}
          />
        ) : null}
      </Modal>

      <LeadDrawer
        leadId={openLead}
        onClose={() => update({ lead: null })}
        onOpenLead={(id) => update({ lead: id })}
      />
    </div>
  );
}
