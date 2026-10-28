import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage, Section } from "@/features/marketing/public-shell";

export const metadata: Metadata = { title: "Beta FAQ" };

const link = "font-semibold underline underline-offset-2";

/** Beta FAQ with the known limitations (PROMPT §1A, PHASES 5.3). Honest about what isn't built. */
export default function BetaPage() {
  return (
    <PublicPage
      title="Beta FAQ"
      intro="FitCoach is in a closed beta with a small group of independent trainers in India. Here's what that means."
    >
      <Section title="Who can join?">
        <p>
          Trainers with an invite code. If you don&apos;t have one,{" "}
          <Link href="/pricing#request-access" className={link}>
            request beta access
          </Link>
          . Your clients don&apos;t need a code — you invite them from the app, by WhatsApp or
          email.
        </p>
      </Section>

      <Section title="Does it cost anything?">
        <p>
          No. FitCoach is free during the beta. There&apos;s no card to enter and nothing is
          charged. If paid plans are introduced later, you&apos;ll be told in advance.
        </p>
      </Section>

      <Section title="What works today">
        <ul>
          <li>A public enquiry page, leads, follow-ups and trial sessions</li>
          <li>Converting leads to clients, onboarding and packages with sessions left</li>
          <li>A calendar with one-off and recurring sessions and attendance</li>
          <li>Programs, templates, workout logging, check-ins and progress charts</li>
          <li>A client app on the phone, opened from an invite link</li>
          <li>WhatsApp messages from templates, sent by you from your own WhatsApp</li>
          <li>Export of all your data as CSV files</li>
        </ul>
      </Section>

      <Section title="Known limitations">
        <ul>
          <li>No group sessions or classes — every session is with one client or lead.</li>
          <li>No chat inside the app. Messages go through your own WhatsApp or email.</li>
          <li>No self-booking — clients can&apos;t book or move sessions themselves.</li>
          <li>No progress photos yet.</li>
          <li>
            Payments are recorded manually. FitCoach doesn&apos;t collect money or send invoices.
          </li>
          <li>No automatic reminders by email, SMS or push notification yet.</li>
          <li>No nutrition plans.</li>
          <li>English only for now.</li>
          <li>Changes need an internet connection; the app shows when you&apos;re offline.</li>
        </ul>
      </Section>

      <Section title="Can I install it on my phone?">
        <p>
          Yes. On Android, open FitCoach in Chrome and choose <strong>Install app</strong>. On
          iPhone, open it in Safari, tap <strong>Share</strong>, then{" "}
          <strong>Add to Home Screen</strong>. Signed in, you&apos;ll also find install steps under
          Settings (trainers) or More (clients).
        </p>
      </Section>

      <Section title="What happens to my data?">
        <p>
          Your data stays yours. You can export it at any time from Settings. Read the{" "}
          <Link href="/privacy" className={link}>
            privacy policy
          </Link>{" "}
          for what we store and why.
        </p>
      </Section>

      <Section title="How do I report a problem?">
        <p>
          Use <strong>Send feedback</strong> in the app menu. It tells us which screen you were on.
          We read every message during the beta.
        </p>
      </Section>
    </PublicPage>
  );
}
