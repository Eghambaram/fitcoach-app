import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "../ui/card";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * A metric tile (§7.2). `value` must come from the database — never a sample number (§7.3).
 * `caption` explains the definition or split; deltas only when a comparison period has data.
 */
export function KpiCard({
  label,
  value,
  caption,
  icon: Icon,
  href,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  icon?: LucideIcon;
  href?: string;
}) {
  const body = (
    <Card className="flex min-w-40 items-start gap-3 p-4 transition-colors hover:border-charcoal/20">
      {Icon ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-success-soft text-success">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      ) : null}
      <div className="min-w-0">
        <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-card">
      {body}
    </Link>
  ) : (
    body
  );
}
