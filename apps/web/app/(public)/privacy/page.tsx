import type { Metadata } from "next";
import { ContactLine, LegalReviewNotice } from "@/features/marketing/legal-notice";
import { PublicPage, Section } from "@/features/marketing/public-shell";

export const metadata: Metadata = { title: "Privacy policy" };

/**
 * Privacy policy, written factually from PROMPT §12 (what the code actually does). No compliance
 * certification claims (§12.4). Marked as needing legal review.
 */
export default function PrivacyPage() {
  return (
    <PublicPage
      title="Privacy policy"
      intro="What FitCoach stores, why, who can see it, and how to get it out or deleted."
      notice={<LegalReviewNotice />}
    >
      <Section title="Who we are and who decides">
        <p>
          FitCoach is software that personal trainers use to run their coaching business. A trainer
          decides which client and lead details to add and is responsible for having their
          clients&apos; consent. FitCoach stores and processes that data on the trainer&apos;s
          behalf, and only to provide the service.
        </p>
      </Section>

      <Section title="What we store">
        <ul>
          <li>
            <strong>Trainer accounts:</strong> name, email, a hashed password (never the password
            itself), business details and settings.
          </li>
          <li>
            <strong>Leads and clients:</strong> what the trainer or the enquiry form enters — name,
            phone, email, goals, notes, appointments, packages and payment records.
          </li>
          <li>
            <strong>Coaching data:</strong> programs, workout logs, measurements and check-ins.
            Check-ins are self-reported by clients. FitCoach makes no medical diagnosis.
          </li>
          <li>
            <strong>Files:</strong> profile photos and public page photos, re-encoded so hidden
            details such as location (EXIF) are removed. Originals are not kept.
          </li>
          <li>
            <strong>Security records:</strong> sign-in sessions, an audit log of important changes,
            and network addresses stored only as one-way hashes.
          </li>
          <li>
            <strong>Feedback</strong> you send us from the app, with the screen it came from.
          </li>
        </ul>
      </Section>

      <Section title="Who can see what">
        <ul>
          <li>
            Each trainer&apos;s workspace is separated from every other at the database level.
          </li>
          <li>
            Clients see only their own workouts, schedule, check-ins, sessions left and the progress
            their trainer chose to share — never trainer notes, prices or payment records.
          </li>
          <li>
            The FitCoach team sees totals (for example, how many trainers are active), not your
            clients&apos; details. Looking at a workspace&apos;s data for support needs a
            time-limited, logged permission.
          </li>
        </ul>
      </Section>

      <Section title="Cookies and analytics">
        <p>
          FitCoach uses one essential cookie to keep you signed in. There are no advertising cookies
          and no third-party analytics. To learn which features are used, we record product events
          (for example, &quot;a program was assigned&quot;) without names, contact details, free
          text or health data.
        </p>
      </Section>

      <Section title="Where data is kept">
        <p>
          The database runs on Railway&apos;s cloud servers. Files and backups are kept in
          Cloudflare R2 object storage. Emails (sign-in codes, invites) are sent through an email
          delivery provider. Data is encrypted in transit, and private files such as data exports
          are only handed out after checking you&apos;re allowed to see them.
        </p>
      </Section>

      <Section title="WhatsApp">
        <p>
          FitCoach doesn&apos;t send WhatsApp messages. It prepares a message and opens WhatsApp on
          the trainer&apos;s own phone; the trainer decides whether to send it.
        </p>
      </Section>

      <Section title="Export and deletion">
        <ul>
          <li>Trainers can export all their workspace data as CSV files at any time.</li>
          <li>Export files are deleted automatically after a day.</li>
          <li>
            During the beta, deletion of a client or a whole workspace is done on request by the
            FitCoach team, using a logged procedure.
          </li>
          <li>Sign-in sessions and spent sign-in codes are removed regularly.</li>
        </ul>
      </Section>

      <Section title="Contact">
        <ContactLine />
      </Section>
    </PublicPage>
  );
}
