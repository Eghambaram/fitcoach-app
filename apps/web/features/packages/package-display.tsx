"use client";

import { PACKAGE_STATUS_LABELS, type PackageCard, type PackageStatus } from "@fitcoach/shared";
import type { InputHTMLAttributes } from "react";
import { type PillTone, StatusPill } from "@/components/shared/status";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_TONES: Record<PackageStatus, PillTone> = {
  active: "success",
  completed: "neutral",
  expired: "warning",
  cancelled: "neutral",
};

export function PackageStatusPill({ status }: { status: PackageStatus }) {
  return <StatusPill tone={STATUS_TONES[status]}>{PACKAGE_STATUS_LABELS[status]}</StatusPill>;
}

/** "11 Apr 2031" for a YYYY-MM-DD date (no time zone can shift it). */
export function dateLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Today in the browser, as YYYY-MM-DD. */
export const todayIso = () => new Intl.DateTimeFormat("en-CA").format(new Date());

/** "8 of 12 used" with a bar; the text carries the meaning, the bar is decoration (§7.4). */
export function SessionsProgress({
  used,
  included,
  className,
}: {
  used: number;
  included: number;
  className?: string;
}) {
  const ratio = included > 0 ? Math.min(1, Math.max(0, used / included)) : 0;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p className="text-sm">
        <span className="font-semibold">
          {used} of {included} used
        </span>{" "}
        <span className="text-muted-foreground">· {Math.max(0, included - used)} left</span>
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-lime" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

/** One line for a package's sessions: "8 of 12 left" or "Unlimited · 3× a week". */
export function sessionsLine(
  pkg: Pick<PackageCard, "kind" | "sessionsLeft" | "sessionsIncluded" | "sessionsPerWeek">,
): string {
  if (pkg.kind === "session_pack" && pkg.sessionsLeft !== null) {
    return `${pkg.sessionsLeft} of ${pkg.sessionsIncluded ?? 0} sessions left`;
  }
  const base = pkg.kind === "online_coaching" ? "Online coaching" : "Unlimited sessions";
  return pkg.sessionsPerWeek ? `${base} · ${pkg.sessionsPerWeek}× a week` : base;
}

/** Rupees in the box, integer paise in the value (CLAUDE.md rule 20a). Empty → undefined. */
export function RupeeInput({
  value,
  onValueChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onValueChange: (paise: number | undefined) => void;
}) {
  return (
    <Input
      {...props}
      type="number"
      inputMode="decimal"
      min={0}
      step="0.01"
      value={value === null || value === undefined ? "" : String(value / 100)}
      onChange={(event) =>
        onValueChange(
          event.target.value === "" ? undefined : Math.round(Number(event.target.value) * 100),
        )
      }
    />
  );
}
