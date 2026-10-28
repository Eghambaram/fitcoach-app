"use client";

import type { FeedbackStatus, PlatformFeedbackListResponse } from "@fitcoach/shared";
import { useMutation } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilterBar } from "@/components/shared/data-list";
import { useOnline } from "@/components/shared/offline-banner";
import { EmptyState, type PillTone, StatusPill } from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { browserApi, unwrap } from "@/lib/api/browser";
import { useUrlQuery } from "@/lib/use-url-query";
import { formatDateTime } from "./format";

const STATUS: Record<FeedbackStatus, { label: string; tone: PillTone }> = {
  open: { label: "New", tone: "info" },
  triaged: { label: "Triaged", tone: "warning" },
  closed: { label: "Closed", tone: "neutral" },
};

/** The feedback inbox (PROMPT §16.0): what trainers sent from "Send feedback", by status. */
export function FeedbackInbox({
  data,
  status,
}: {
  data: PlatformFeedbackListResponse;
  status: FeedbackStatus;
}) {
  const { update } = useUrlQuery();
  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        tabs={(["open", "triaged", "closed"] as const).map((value) => ({
          value,
          label: STATUS[value].label,
          count: data.counts[value],
        }))}
        activeTab={status}
        onTabChange={(value) => update({ status: value === "open" ? null : value })}
      />
      {data.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessageSquareText}
            title={
              status === "open"
                ? "Nothing new"
                : `No ${STATUS[status].label.toLowerCase()} feedback`
            }
            description="Trainers send feedback from the app menu; it shows up here with the screen it came from."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((item) => (
            <li key={item.id}>
              <FeedbackCard item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedbackCard({ item }: { item: PlatformFeedbackListResponse["items"][number] }) {
  const router = useRouter();
  const online = useOnline();
  const move = useMutation({
    mutationFn: (status: FeedbackStatus) =>
      unwrap(
        browserApi.PATCH("/v1/platform/feedback/{id}", {
          params: { path: { id: item.id } },
          body: { status },
        }),
      ),
    onSuccess: () => router.refresh(),
    onError: (error) => toast.error(error.message),
  });
  const next: FeedbackStatus[] =
    item.status === "open"
      ? ["triaged", "closed"]
      : item.status === "triaged"
        ? ["closed", "open"]
        : ["open"];
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href={`/platform/trainers/${item.workspaceId}`}
          className="font-semibold hover:underline"
        >
          {item.businessName}
        </Link>
        <span className="text-muted-foreground">
          {item.trainerName ?? "Former user"} · {formatDateTime(item.createdAt)}
        </span>
        <StatusPill tone={STATUS[item.status].tone} className="ml-auto">
          {STATUS[item.status].label}
        </StatusPill>
      </div>
      <p className="whitespace-pre-wrap">{item.message}</p>
      {item.page ? (
        <p className="text-xs text-muted-foreground">
          Sent from <span className="font-mono">{item.page}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {next.map((status) => (
          <Button
            key={status}
            variant="outline"
            disabled={!online}
            loading={move.isPending && move.variables === status}
            onClick={() => move.mutate(status)}
          >
            {status === "triaged" ? "Mark triaged" : status === "closed" ? "Close" : "Reopen"}
          </Button>
        ))}
      </div>
    </Card>
  );
}
