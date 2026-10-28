import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalReviewNotice } from "@/features/marketing/legal-notice";
import { PublicPage, Section } from "@/features/marketing/public-shell";

export const metadata: Metadata = { title: "Terms of use" };

/** Terms of use for the closed beta, in plain language. Marked as needing legal review. */
export default function TermsPage() {
  return (
    <PublicPage
      title="Terms of use"
      intro="The ground rules for using FitCoach during the closed beta."
      notice={<LegalReviewNotice />}
    >
      <Section title="The beta">
        <p>
          FitCoach is in a closed beta. It is free, invite-only, and still changing. Features may
          change or be removed, and there may be bugs or downtime. Keep your own copy of anything
          important —{" "}
          <Link href="/beta" className="font-semibold underline underline-offset-2">
            the beta FAQ
          </Link>{" "}
          lists what isn&apos;t built yet, and you can export your data from Settings at any time.
        </p>
      </Section>

      <Section title="Your account">
        <ul>
          <li>Keep your password private. You&apos;re responsible for activity in your account.</li>
          <li>One account is for one trainer. Don&apos;t share sign-ins.</li>
          <li>
            We may suspend an account that breaks these terms. A suspended workspace becomes
            read-only, and you can still export your data.
          </li>
        </ul>
      </Section>

      <Section title="Your clients' data">
        <ul>
          <li>
            You decide what you add about leads and clients, and you must have their consent to do
            so.
          </li>
          <li>Your data stays yours. We use it only to run FitCoach for you.</li>
          <li>
            Clients you invite agree to these terms and the{" "}
            <Link href="/privacy" className="font-semibold underline underline-offset-2">
              privacy policy
            </Link>{" "}
            when they accept your invite.
          </li>
        </ul>
      </Section>

      <Section title="Health and safety">
        <p>
          FitCoach is a tool for organising coaching. It doesn&apos;t give medical advice and
          doesn&apos;t diagnose anything. Check-ins and measurements are self-reported or entered by
          the trainer. Trainers remain responsible for the programs they give and for their
          clients&apos; safety.
        </p>
      </Section>

      <Section title="Payments">
        <p>
          FitCoach doesn&apos;t handle money. Packages and payments you record are your own notes of
          what was agreed and paid between you and your clients.
        </p>
      </Section>

      <Section title="Fair use">
        <ul>
          <li>Don&apos;t use FitCoach to send spam or to store data you have no right to hold.</li>
          <li>Don&apos;t try to access other trainers&apos; workspaces or break the service.</li>
        </ul>
      </Section>

      <Section title="Contact">
        <ContactLine />
      </Section>
    </PublicPage>
  );
}
