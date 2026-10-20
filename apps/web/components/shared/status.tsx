import { AlertTriangle, CloudOff, Inbox, Lock, PlugZap, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pill tones (§7.1). Always pair the colour with a text label — never colour-only status (§7.4). */
const PILL_TONES = {
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  pink: "bg-pink-soft text-pink",
  success: "bg-success-soft text-success",
  lime: "bg-lime text-lime-foreground",
  neutral: "bg-neutral-soft text-neutral",
  danger: "bg-danger-soft text-danger",
} as const;

export type PillTone = keyof typeof PILL_TONES;

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        PILL_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

interface StateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

function StateBlock({
  icon: Icon,
  tone,
  title,
  description,
  action,
  className,
  role,
}: StateProps & {
  icon: LucideIcon;
  tone: string;
  role?: "alert" | "status";
}) {
  return (
    <div
      role={role}
      className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}
    >
      <span className={cn("flex size-12 items-center justify-center rounded-full", tone)}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Nothing here yet — say what will appear and how to get started (§7.2). */
export function EmptyState(props: StateProps & { icon?: LucideIcon }) {
  return <StateBlock icon={props.icon ?? Inbox} tone="bg-muted text-muted-foreground" {...props} />;
}

export function ErrorState({
  title = "Something went wrong",
  ...props
}: Partial<StateProps> & { requestId?: string }) {
  const { requestId, description, ...rest } = props;
  return (
    <StateBlock
      icon={AlertTriangle}
      tone="bg-danger-soft text-danger"
      role="alert"
      title={title}
      description={
        <>
          {description ?? "We couldn't load this. Check your connection and try again."}
          {requestId ? <span className="mt-2 block text-xs">Reference: {requestId}</span> : null}
        </>
      }
      {...rest}
    />
  );
}

/** Shown when the API refuses access — hiding a button is not authorization (§5). */
export function PermissionDenied({
  title = "You don't have access to this",
  description = "This area isn't available for your account. If you think that's wrong, contact the FitCoach team.",
  action,
}: Partial<StateProps>) {
  return (
    <StateBlock
      icon={Lock}
      tone="bg-warning-soft text-warning"
      role="alert"
      title={title}
      description={description}
      action={action}
    />
  );
}

/** Honest state for an integration that isn't set up (CLAUDE.md rule 20). */
export function NotConfiguredNotice({ name, description }: { name: string; description?: string }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-control border border-border bg-muted px-4 py-3 text-sm"
    >
      <PlugZap className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <p>
        <span className="font-semibold">{name}: Not configured.</span>{" "}
        <span className="text-muted-foreground">
          {description ?? "This feature is off until it's set up."}
        </span>
      </p>
    </div>
  );
}

export function OfflineNotice() {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-sm font-medium text-warning"
    >
      <CloudOff className="size-4" aria-hidden="true" />
      You're offline. Changes can't be saved until you reconnect.
    </div>
  );
}
