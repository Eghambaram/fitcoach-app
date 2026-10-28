"use client";

import type { Notification, NotificationListResponse } from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { browserApi, unwrap } from "@/lib/api/browser";
import { cn } from "@/lib/utils";
import { formatDateTime } from "../leads/lead-display";

const KEY = ["notifications"];

/**
 * The bell (PROMPT §8.10): unread count, the latest notifications, mark read / mark all read.
 * Refreshes every minute and when the window regains focus; never claims a message was delivered.
 */
export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => unwrap(browserApi.GET("/v1/notifications")),
    refetchInterval: 60_000,
  });
  const store = (next: NotificationListResponse) => queryClient.setQueryData(KEY, next);
  const markRead = useMutation({
    mutationFn: (id: string) =>
      unwrap(browserApi.POST("/v1/notifications/{id}/read", { params: { path: { id } } })),
    onSuccess: store,
    onError: (failure) => toast.error(failure.message),
  });
  const markAll = useMutation({
    mutationFn: () => unwrap(browserApi.POST("/v1/notifications/read-all")),
    onSuccess: store,
    onError: (failure) => toast.error(failure.message),
  });
  const unread = query.data?.unreadCount ?? 0;

  function open(item: Notification) {
    if (!item.readAt) markRead.mutate(item.id);
    if (item.link) router.push(item.link);
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        >
          <Bell aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-1.5 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] leading-5 font-semibold text-white"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          aria-labelledby="notifications-heading"
          className="z-50 flex max-h-[70dvh] w-[min(24rem,calc(100vw-2rem))] flex-col rounded-card border border-border bg-card shadow-drawer"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 id="notifications-heading" className="font-semibold">
              Notifications
            </h2>
            {unread > 0 ? (
              <Button variant="ghost" loading={markAll.isPending} onClick={() => markAll.mutate()}>
                Mark all read
              </Button>
            ) : null}
          </div>
          <div
            className="overflow-y-auto"
            tabIndex={0}
            role="region"
            aria-label="Notification list"
          >
            {query.isPending ? (
              <p role="status" className="p-4 text-sm text-muted-foreground">
                Loading…
              </p>
            ) : query.isError ? (
              <p role="alert" className="p-4 text-sm text-danger">
                We couldn&apos;t load notifications.
              </p>
            ) : query.data.items.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No notifications yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {query.data.items.map((item) => (
                  <li key={item.id}>
                    <Popover.Close asChild>
                      <button
                        type="button"
                        onClick={() => open(item)}
                        className={cn(
                          "flex w-full gap-3 px-4 py-3 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-charcoal",
                          !item.readAt && "bg-lime/15",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            item.readAt ? "bg-transparent" : "bg-charcoal",
                          )}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium">
                            {item.title}
                            {item.readAt ? null : <span className="sr-only"> (unread)</span>}
                          </span>
                          {item.body ? (
                            <span className="text-muted-foreground">{item.body}</span>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(item.createdAt)}
                          </span>
                        </span>
                      </button>
                    </Popover.Close>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
