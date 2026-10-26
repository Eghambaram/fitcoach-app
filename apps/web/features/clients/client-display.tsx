import { CLIENT_STATUS_LABELS, type ClientStatus } from "@fitcoach/shared";
import { type PillTone, StatusPill } from "@/components/shared/status";

const STATUS_TONES: Record<ClientStatus, PillTone> = {
  onboarding_draft: "info",
  active: "success",
  paused: "warning",
  archived: "neutral",
};

/** Client status with its text label, never colour alone (§7.4). */
export function ClientStatusPill({ status }: { status: ClientStatus }) {
  return <StatusPill tone={STATUS_TONES[status]}>{CLIENT_STATUS_LABELS[status]}</StatusPill>;
}
