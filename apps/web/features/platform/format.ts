import type { DependencyStatus, WorkspaceStatus } from "@fitcoach/shared";
import type { PillTone } from "@/components/shared/status";

/** Pure helpers shared by platform server and client components. */

export const WORKSPACE_STATUS: Record<WorkspaceStatus, { label: string; tone: PillTone }> = {
  pending_approval: { label: "Pending approval", tone: "warning" },
  trialing: { label: "Trial", tone: "info" },
  active: { label: "Active", tone: "success" },
  past_due: { label: "Past due", tone: "warning" },
  suspended: { label: "Suspended", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const HEALTH_STATUS: Record<DependencyStatus, { label: string; tone: PillTone }> = {
  ok: { label: "OK", tone: "success" },
  degraded: { label: "Degraded", tone: "danger" },
  unknown: { label: "Unknown", tone: "neutral" },
  not_configured: { label: "Not configured", tone: "neutral" },
};

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});
const dateOnly = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

/** Platform times are shown in IST (the beta's market), labelled as such where it matters. */
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatRelative(iso: string | null, now = Date.now()): string {
  if (!iso) return "Never";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}
