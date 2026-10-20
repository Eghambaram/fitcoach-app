import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

const BENEFITS = [
  "Leads, follow-ups and trials in one list",
  "Packages, sessions left and payments due",
  "Programs, workouts and client progress",
] as const;

/** Abstract progress motif (ADR-0034): rising bars and an arc, no people or third-party imagery. */
function HeroArt() {
  return (
    <svg viewBox="0 0 320 220" className="w-full max-w-sm" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="fc-bar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="var(--lime)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--lime)" />
        </linearGradient>
      </defs>
      <circle
        cx="250"
        cy="60"
        r="44"
        fill="none"
        stroke="var(--lime)"
        strokeOpacity="0.35"
        strokeWidth="10"
      />
      <path
        d="M250 16a44 44 0 0 1 41.8 57.6"
        fill="none"
        stroke="var(--lime)"
        strokeWidth="10"
        strokeLinecap="round"
      />
      {[40, 70, 100, 130, 160].map((height, index) => (
        <rect
          key={height}
          x={24 + index * 42}
          y={200 - height}
          width="26"
          height={height}
          rx="8"
          fill="url(#fc-bar)"
        />
      ))}
      <path
        d="M30 150 L80 120 L120 132 L170 86 L210 96"
        fill="none"
        stroke="var(--sidebar-foreground)"
        strokeOpacity="0.7"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside
        aria-label="About FitCoach"
        className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex"
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(120% 80% at 100% 0%, rgb(200 241 105 / 0.18), transparent 60%)",
          }}
          aria-hidden="true"
        />
        <Link href="/" className="relative self-start rounded-control">
          <Logo tone="light" />
        </Link>
        <div className="relative flex flex-col gap-8">
          <HeroArt />
          <div>
            <h2 className="text-3xl leading-tight font-bold">
              Run your coaching business <span className="text-lime">from your phone.</span>
            </h2>
            <ul className="mt-6 flex flex-col gap-3">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-3 text-sidebar-muted">
                  <span className="flex size-6 items-center justify-center rounded-full bg-lime text-lime-foreground">
                    <Check className="size-4" aria-hidden="true" />
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="relative text-sm text-sidebar-muted">Closed beta · by invitation</p>
      </aside>

      <div className="flex flex-col px-4 py-8 sm:px-8 lg:justify-center">
        <header className="mb-10 lg:hidden">
          <Link href="/" className="inline-block rounded-control">
            <Logo />
          </Link>
        </header>
        <main className="mx-auto w-full max-w-md">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? (
            <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

/** Form-level message (not tied to one field), announced to screen readers. */
export function FormAlert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "success" | "info";
  children: ReactNode;
}) {
  const styles = {
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
  }[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`rounded-control px-4 py-3 text-sm font-medium ${styles}`}
    >
      {children}
    </div>
  );
}
