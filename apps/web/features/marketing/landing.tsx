import {
  CalendarCheck2,
  ClipboardCheck,
  Dumbbell,
  type LucideIcon,
  Package,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicFooter, PublicHeader } from "./public-shell";

const FEATURES: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Leads & follow-ups",
    description:
      "Every enquiry from your public page lands in one list, with the next follow-up so nobody slips.",
    icon: UserPlus,
  },
  {
    title: "Trials that convert",
    description:
      "Book a trial, mark how it went, and turn the lead into a client with a package in one step.",
    icon: CalendarCheck2,
  },
  {
    title: "Packages & sessions left",
    description:
      "Sessions are deducted when you mark attendance. Record payments by UPI, cash or bank.",
    icon: Package,
  },
  {
    title: "Programs & workout logs",
    description:
      "Start from a template, assign it, and log sets live with your client — or let them log it.",
    icon: Dumbbell,
  },
  {
    title: "Check-ins & progress",
    description:
      "Clients send a quick self-reported check-in. You see measurements and strength over time.",
    icon: ClipboardCheck,
  },
];

/** A drawn phone, not a screenshot: shapes and labels only, no invented people or numbers (§7.3). */
function PhoneMockup() {
  const row = (label: string, tone: string) => (
    <div className="flex items-center gap-3 rounded-[14px] bg-white p-3">
      <span className={`size-8 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
      <div className="flex-1">
        <p className="text-[11px] font-semibold text-charcoal">{label}</p>
        <div className="mt-1.5 h-1.5 w-3/4 rounded-full bg-muted" />
      </div>
    </div>
  );
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-64 rounded-[40px] border-[10px] border-charcoal-soft bg-background p-4 shadow-2xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <LogoMark className="size-6" />
        <div className="h-2 w-16 rounded-full bg-muted" />
      </div>
      <div className="rounded-[16px] bg-charcoal p-4">
        <p className="text-[11px] font-medium text-sidebar-muted">Today</p>
        <p className="mt-1 text-sm font-semibold text-sidebar-foreground">Your sessions</p>
        <div className="mt-3 h-2 w-full rounded-full bg-white/10">
          <div className="h-2 w-2/3 rounded-full bg-lime" />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {row("Follow-up due", "bg-warning-soft")}
        {row("Trial booked", "bg-info-soft")}
        {row("Check-in received", "bg-success-soft")}
        {row("Package renewal", "bg-pink-soft")}
      </div>
    </div>
  );
}

/** Public landing page (PROMPT §6, board 01 adjusted for the closed beta). */
export function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader tone="dark" />
      <main id="main" className="flex-1">
        <div className="bg-charcoal">
          <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 md:grid-cols-2 md:px-8 md:pt-16 md:pb-24">
            <div className="flex flex-col gap-6">
              <span className="self-start rounded-full bg-lime px-3 py-1 text-xs font-semibold text-lime-foreground">
                Closed beta for personal trainers in India
              </span>
              <h1 className="text-4xl font-bold tracking-tight text-sidebar-foreground md:text-5xl">
                Personal Trainer Copilot
              </h1>
              <p className="text-lg text-sidebar-muted">
                Spend less time managing your coaching business and more time helping clients get
                results. Leads, trials, packages, programs and check-ins in one mobile-first app.
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/pricing#request-access">Request beta access</Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="ghost"
                  className="text-sidebar-foreground hover:bg-white/10"
                >
                  <Link href="/signup">I have an invite code</Link>
                </Button>
              </div>
            </div>
            <PhoneMockup />
          </section>
        </div>

        <section
          id="features"
          aria-labelledby="features-title"
          className="mx-auto max-w-6xl px-4 py-16 md:px-8"
        >
          <h2 id="features-title" className="text-2xl font-bold tracking-tight text-charcoal">
            From first enquiry to visible progress
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            FitCoach follows the way independent trainers already work, and replaces the notebook,
            spreadsheet and scattered chats.
          </p>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {FEATURES.map(({ title, description, icon: Icon }) => (
              <li key={title}>
                <Card className="flex h-full flex-col gap-3 p-5">
                  <span className="flex size-10 items-center justify-center rounded-control bg-lime">
                    <Icon className="size-5 text-lime-foreground" aria-hidden="true" />
                  </span>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="beta-title" className="border-t border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-14 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <h2 id="beta-title" className="text-xl font-bold text-charcoal">
                Free while we&apos;re in beta
              </h2>
              <p className="mt-1 max-w-xl text-muted-foreground">
                We&apos;re building FitCoach with a small group of trainers. Read what works today
                and what doesn&apos;t yet before you join.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="dark">
                <Link href="/beta">Read the beta FAQ</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/client/login">I&apos;m a client</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
