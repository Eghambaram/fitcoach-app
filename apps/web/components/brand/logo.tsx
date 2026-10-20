import { cn } from "@/lib/utils";

/**
 * Original FitCoach mark (ADR-0034): a lime rounded square with an upward stroke — progress, not a
 * person or a brand. The wordmark is set in Inter. Replace this one component to rebrand.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8", className)}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="9" fill="var(--lime)" />
      <path
        d="M8 21.5 13.5 16l4 3.5L24 11"
        fill="none"
        stroke="var(--charcoal)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 11H24v4.5"
        fill="none"
        stroke="var(--charcoal)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  tone = "dark",
  className,
}: {
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span
        aria-hidden="true"
        className={cn(
          "text-base font-extrabold tracking-[0.14em]",
          tone === "light" ? "text-sidebar-foreground" : "text-charcoal",
        )}
      >
        FITCOACH
      </span>
      <span className="sr-only">FitCoach</span>
    </span>
  );
}
