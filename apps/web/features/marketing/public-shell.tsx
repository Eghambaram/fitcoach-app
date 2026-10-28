import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/beta", label: "Beta FAQ" },
] as const;

/** Header for the public site (board 01, adjusted): no brand logos or claims, just the way in. */
export function PublicHeader({ tone = "light" }: { tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <header className={cn(dark ? "bg-charcoal text-sidebar-foreground" : "bg-background")}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <Link href="/" className="rounded-control" aria-label="FitCoach home">
          <Logo tone={dark ? "light" : "dark"} />
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1 text-sm font-medium">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "hidden rounded-control px-3 py-2 sm:inline-block",
                dark ? "hover:bg-white/10" : "hover:bg-muted",
              )}
            >
              {item.label}
            </Link>
          ))}
          <Button
            asChild
            variant={dark ? "ghost" : "outline"}
            className={cn(dark && "text-sidebar-foreground hover:bg-white/10")}
          >
            <Link href="/login">Log in</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
        <p>FitCoach — Personal Trainer Copilot. Closed beta.</p>
        <nav aria-label="Legal and help" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/beta" className="hover:text-foreground">
            Beta FAQ
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/client/login" className="hover:text-foreground">
            Client login
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/** A plain reading page (pricing, FAQ, legal): header, a narrow column, footer. */
export function PublicPage({
  title,
  intro,
  notice,
  children,
}: {
  title: string;
  intro?: ReactNode;
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 md:px-8 md:py-16">
        <h1 className="text-3xl font-bold tracking-tight text-charcoal md:text-4xl">{title}</h1>
        {intro ? <div className="mt-3 text-lg text-muted-foreground">{intro}</div> : null}
        {notice ? <div className="mt-6">{notice}</div> : null}
        <div className="mt-8 flex flex-col gap-8">{children}</div>
      </main>
      <PublicFooter />
    </div>
  );
}

/** A titled block of prose in a reading page. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-charcoal">{title}</h2>
      <div className="flex flex-col gap-3 leading-relaxed text-foreground [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
