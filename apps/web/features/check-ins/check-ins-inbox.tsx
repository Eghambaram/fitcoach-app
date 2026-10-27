"use client";

import {
  type CheckInListResponse,
  type CheckInReviewFilter,
  type Feeling,
  FEELING_LABELS,
  FEELINGS,
  type TrainerCheckIn,
} from "@fitcoach/shared";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ErrorState } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { browserApi, unwrap } from "@/lib/api/browser";
import { cn } from "@/lib/utils";
import { CheckInCard } from "./check-in-card";

/** `/app/check-ins` (PROMPT §8.7): the inbox, unreviewed first. */
export function CheckInsInbox() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CheckInReviewFilter>("unreviewed");
  const [feeling, setFeeling] = useState<Feeling | "">("");
  const key = ["check-ins", status, feeling];
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      unwrap(
        browserApi.GET("/v1/check-ins", {
          params: {
            query: { status, feeling: feeling || undefined, offset: pageParam },
          },
        }),
      ),
    getNextPageParam: (last: CheckInListResponse, pages) =>
      last.hasMore ? pages.reduce((total, page) => total + page.items.length, 0) : undefined,
  });
  const counts = query.data?.pages[0]?.counts;
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  function reviewed(next: TrainerCheckIn) {
    queryClient.setQueryData(key, (data: typeof query.data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => (item.id === next.id ? next : item)),
            })),
          }
        : data,
    );
    void queryClient.invalidateQueries({ queryKey: ["check-ins"], refetchType: "none" });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Check-ins"
        description="What clients reported about how they feel, their energy, sleep and soreness."
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div
          role="tablist"
          aria-label="Review status"
          className="flex gap-1 rounded-control border border-border bg-card p-1"
        >
          {(
            [
              ["unreviewed", `To review${counts ? ` (${counts.unreviewed})` : ""}`],
              ["reviewed", `Reviewed${counts ? ` (${counts.reviewed})` : ""}`],
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={status === value}
              onClick={() => setStatus(value)}
              className={cn(
                "min-h-9 rounded-[10px] px-3 text-sm font-medium",
                status === value ? "bg-charcoal text-white" : "hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Field label="Feeling" className="w-40">
          <Select
            value={feeling}
            onChange={(event) => setFeeling(event.target.value as Feeling | "")}
          >
            <option value="">Any</option>
            {FEELINGS.map((value) => (
              <option key={value} value={value}>
                {FEELING_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {query.isPending ? (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      ) : query.isError ? (
        <Card>
          <ErrorState description="We couldn't load check-ins. Please try again." />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardCheck}
            title={status === "unreviewed" ? "All caught up" : "No check-ins yet"}
            description={
              status === "unreviewed"
                ? "New check-ins from your clients appear here."
                : "Clients send check-ins from their app. Turn check-ins on per client in their profile."
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <CheckInCard checkIn={item} client={item.client} onReviewed={reviewed} />
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}
