import { CalendarCheck, Dumbbell, LineChart, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

const BENEFITS = [
  { icon: Dumbbell, label: "Your workouts" },
  { icon: LineChart, label: "Your progress" },
  { icon: CalendarCheck, label: "Your sessions" },
  { icon: MessageCircle, label: "Support from your trainer" },
] as const;

/** Client arrival and sign-in (PROMPT §9, client board 1): a dark hero, then one action. */
export function ClientAuthLayout({
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
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="bg-sidebar px-4 pt-10 pb-8 text-sidebar-foreground sm:px-8">
        <div className="mx-auto flex max-w-md flex-col gap-6">
          <Logo tone="light" />
          <ul className="grid grid-cols-2 gap-3 text-sm text-sidebar-muted">
            {BENEFITS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2">
                <Icon className="size-4 text-lime" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-8 sm:px-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-6">{children}</div>
        {footer ? (
          <div className="mt-8 text-center text-sm text-muted-foreground">{footer}</div>
        ) : null}
      </main>
    </div>
  );
}
