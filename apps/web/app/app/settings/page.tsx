import type { Metadata } from "next";
import { ChevronRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings" };

/** Settings sections appear as they're built; profile, public page, templates and more arrive in step 2.1. */
const SECTIONS = [
  {
    href: "/app/settings/security",
    title: "Security",
    description: "Where you're signed in, and signing out of other devices.",
    icon: ShieldCheck,
  },
] as const;

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Manage your account and workspace." />
      <ul className="flex flex-col gap-3">
        {SECTIONS.map(({ href, title, description, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="block rounded-card">
              <Card className="flex items-center gap-4 p-4 transition-colors hover:border-charcoal/20">
                <span className="flex size-10 items-center justify-center rounded-control bg-muted">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{title}</span>
                  <span className="block text-sm text-muted-foreground">{description}</span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
