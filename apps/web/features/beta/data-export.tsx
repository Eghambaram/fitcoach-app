"use client";

import {
  type DataExport,
  type DataExportListResponse,
  EXPORT_AVAILABLE_HOURS,
  type ExportStatus,
} from "@fitcoach/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileArchive } from "lucide-react";
import { toast } from "sonner";
import { useOnline } from "@/components/shared/offline-banner";
import {
  EmptyState,
  NotConfiguredNotice,
  type PillTone,
  StatusPill,
} from "@/components/shared/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { browserApi, unwrap } from "@/lib/api/browser";

const STATUS: Record<ExportStatus, { label: string; tone: PillTone }> = {
  pending: { label: "Preparing", tone: "info" },
  ready: { label: "Ready", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};

const KEY = ["exports"] as const;

function size(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso),
  );

/**
 * Data export (PROMPT §8.12): request a zip of CSVs, built in the background; download it for
 * 24 hours. Polls while one is being prepared. Works in a suspended workspace too.
 */
export function DataExportPanel({ initial }: { initial: DataExportListResponse }) {
  const online = useOnline();
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => unwrap(browserApi.GET("/v1/exports")),
    initialData: initial,
    refetchInterval: (query) =>
      query.state.data?.exports.some((item) => item.status === "pending") ? 3000 : false,
  });
  const request = useMutation({
    mutationFn: () => unwrap(browserApi.POST("/v1/exports")),
    onSuccess: (created) => {
      queryClient.setQueryData<DataExportListResponse>(KEY, (current) =>
        current ? { ...current, exports: [created, ...current.exports] } : current,
      );
      toast.success("Preparing your export. It usually takes under a minute.");
    },
    onError: (error) => toast.error(error.message),
  });

  const data = list.data;
  if (!data.available) {
    return (
      <NotConfiguredNotice
        name="File storage"
        description="Exports are saved as files, and file storage isn't set up on this server yet."
      />
    );
  }
  const preparing = data.exports.some((item) => item.status === "pending");

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:p-6">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-muted">
          <FileArchive className="size-5" aria-hidden="true" />
        </span>
        <div className="flex-1">
          <p className="font-semibold">Everything in one zip</p>
          <p className="text-sm text-muted-foreground">
            Leads, clients, sessions, packages, payments and measurements as CSV files that open in
            Excel or Google Sheets. Each export can be downloaded for {EXPORT_AVAILABLE_HOURS}{" "}
            hours.
          </p>
        </div>
        <Button
          variant="dark"
          onClick={() => request.mutate()}
          loading={request.isPending}
          disabled={!online || preparing}
        >
          {preparing ? "Preparing…" : "Export my data"}
        </Button>
      </Card>

      {data.exports.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileArchive}
            title="No exports yet"
            description="Your exports will appear here."
          />
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          <h2 className="sr-only">Your exports</h2>
          <ul aria-live="polite" className="divide-y divide-border">
            {data.exports.map((item) => (
              <ExportRow key={item.id} item={item} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ExportRow({ item }: { item: DataExport }) {
  const status = STATUS[item.status];
  return (
    <li className="flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">Requested {when(item.createdAt)}</p>
        <p className="text-sm text-muted-foreground">
          {item.status === "ready" && item.expiresAt
            ? `${size(item.sizeBytes)} · available until ${when(item.expiresAt)}`
            : item.status === "failed"
              ? "Something went wrong. Please request a new export."
              : item.status === "pending"
                ? "Being prepared…"
                : "No longer available."}
        </p>
      </div>
      <StatusPill tone={status.tone}>{status.label}</StatusPill>
      {item.status === "ready" ? (
        <Button asChild variant="outline">
          {/* Same-origin, through the proxy: the API checks the session on every download. */}
          <a href={`/api/v1/exports/${item.id}/download`} download>
            <Download className="size-4" aria-hidden="true" />
            Download
          </a>
        </Button>
      ) : null}
    </li>
  );
}
