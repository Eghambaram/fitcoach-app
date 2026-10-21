import type { Metadata } from "next";
import {
  ChevronRight,
  ClipboardCheck,
  Globe2,
  MessageSquareText,
  Package,
  QrCode,
  Ruler,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Settings" };

/** Settings sections (PROMPT §8.12). Data export and help arrive in step 5.3. */
const SECTIONS = [
  {
    href: "/app/settings/profile",
    title: "Profile & public page",
    description: "Your photo, details and enquiry page. Publish it to start getting leads.",
    icon: UserRound,
  },
  {
    href: "/app/settings/public-page/share",
    title: "Share your page",
    description: "Link, QR code and links for Instagram, WhatsApp and more.",
    icon: QrCode,
  },
  {
    href: "/app/settings/templates",
    title: "Message templates",
    description: "Ready-made WhatsApp messages for follow-ups, reminders and invites.",
    icon: MessageSquareText,
  },
  {
    href: "/app/settings/packages",
    title: "Packages",
    description: "Package presets, no-show and late-cancel policy, alerts.",
    icon: Package,
  },
  {
    href: "/app/settings/check-ins",
    title: "Check-ins & attention",
    description: "Check-in frequency and when a client needs attention.",
    icon: ClipboardCheck,
  },
  {
    href: "/app/settings/locale",
    title: "Units & locale",
    description: "kg or lb, cm or in, time zone and country.",
    icon: Ruler,
  },
  {
    href: "/app/settings/security",
    title: "Security",
    description: "Change your password and see where you're signed in.",
    icon: ShieldCheck,
  },
] as const;

export default async function SettingsPage() {
  const api = await serverApi();
  const { data } = await api.GET("/v1/settings");
  const plan = data?.plan;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Manage your account and workspace." />
      {plan ? (
        <Card className="flex items-center gap-4 p-4">
          <span className="flex size-10 items-center justify-center rounded-control bg-lime">
            <Globe2 className="size-5 text-lime-foreground" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold">You&apos;re on the {plan.planName.toLowerCase()} plan</p>
            <p className="text-sm text-muted-foreground">
              Up to {plan.maxActiveClients} active clients, free during the beta.
            </p>
          </div>
        </Card>
      ) : null}
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
