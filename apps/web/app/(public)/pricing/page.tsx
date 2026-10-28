import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PublicPage } from "@/features/marketing/public-shell";
import { RequestAccessForm } from "@/features/marketing/request-access";

export const metadata: Metadata = { title: "Pricing" };

const INCLUDED = [
  "Public enquiry page with a link and QR code",
  "Leads, follow-ups, trials and conversion",
  "Clients, packages, sessions left and manual payments",
  "Calendar with recurring sessions",
  "Programs, starter templates and an exercise library",
  "Workout logging, check-ins and progress",
  "A simple app for your clients",
  "WhatsApp message templates (sent from your own phone)",
  "Export of all your data",
];

/** MVP pricing (PROMPT §6, board 01 #3): no plan cards until billing exists (v1.1). */
export default function PricingPage() {
  return (
    <PublicPage
      title="Free during the beta"
      intro="FitCoach is free for invited trainers while we're in closed beta. Paid plans come later, and we'll tell you well before anything changes."
    >
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-charcoal">What&apos;s included</h2>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Some things aren&apos;t there yet —{" "}
          <Link href="/beta" className="font-semibold text-foreground underline underline-offset-2">
            see the known limitations
          </Link>
          .
        </p>
      </Card>
      <section id="request-access" aria-labelledby="request-title" className="scroll-mt-6">
        <Card className="p-6">
          <h2 id="request-title" className="text-lg font-semibold text-charcoal">
            Request beta access
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            Already have an invite code?{" "}
            <Link
              href="/signup"
              className="font-semibold text-foreground underline underline-offset-2"
            >
              Create your account
            </Link>
            .
          </p>
          <RequestAccessForm />
        </Card>
      </section>
    </PublicPage>
  );
}
