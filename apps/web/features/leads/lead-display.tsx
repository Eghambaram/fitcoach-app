import { LEAD_STAGE_LABELS, type LeadStage, toWhatsAppNumber } from "@fitcoach/shared";
import { MessageCircle, Phone } from "lucide-react";
import { type PillTone, StatusPill } from "@/components/shared/status";
import { cn } from "@/lib/utils";

const STAGE_TONES: Record<LeadStage, PillTone> = {
  new: "info",
  contacted: "warning",
  trial_booked: "pink",
  interested: "success",
  converted: "lime",
  lost: "neutral",
};

/** Stage as a pill — always with its text label, never colour alone (§7.4). */
export function StagePill({ stage, className }: { stage: LeadStage; className?: string }) {
  return (
    <StatusPill tone={STAGE_TONES[stage]} className={className}>
      {LEAD_STAGE_LABELS[stage]}
    </StatusPill>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Today", "Yesterday", "3 days ago", then a short date. Shown in the viewer's time zone. */
export function formatDay(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const days = Math.round((startOf(now).getTime() - startOf(date).getTime()) / DAY_MS);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Call / WhatsApp shortcuts. WhatsApp opens a plain chat; message templates arrive in step 2.3. */
export function ContactLinks({
  name,
  phone,
  size = "sm",
}: {
  name: string;
  phone: string | null;
  size?: "sm" | "lg";
}) {
  if (!phone) return null;
  const box = cn(
    "flex items-center justify-center rounded-control border border-border bg-card hover:bg-muted",
    size === "sm" ? "size-11" : "h-11 flex-1 gap-2 px-4 text-sm font-semibold",
  );
  return (
    <>
      <a
        href={`tel:${phone}`}
        className={box}
        aria-label={size === "sm" ? `Call ${name}` : undefined}
      >
        <Phone className="size-4" aria-hidden="true" />
        {size === "lg" ? "Call" : null}
      </a>
      <a
        href={`https://wa.me/${toWhatsAppNumber(phone)}`}
        target="_blank"
        rel="noreferrer"
        className={box}
        aria-label={size === "sm" ? `WhatsApp ${name}` : undefined}
      >
        <MessageCircle className="size-4" aria-hidden="true" />
        {size === "lg" ? "WhatsApp" : null}
      </a>
    </>
  );
}
