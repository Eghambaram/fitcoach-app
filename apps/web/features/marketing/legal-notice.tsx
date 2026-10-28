import { AlertTriangle } from "lucide-react";

/** Draft legal text must say so until a lawyer has reviewed it (PHASES 5.3). */
export function LegalReviewNotice() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-control border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-semibold">Beta draft — needs legal review before launch.</span> This
        page describes how FitCoach works today in plain language. It will be reviewed by a lawyer
        before FitCoach opens beyond the closed beta.
      </p>
    </div>
  );
}

/** Where to write to. Uses the beta contact address when one is configured. */
export function ContactLine() {
  const email = process.env.NEXT_PUBLIC_BETA_CONTACT_EMAIL;
  return email ? (
    <p>
      Write to{" "}
      <a href={`mailto:${email}`} className="font-semibold underline underline-offset-2">
        {email}
      </a>
      , or use Send feedback in the app.
    </p>
  ) : (
    <p>Use Send feedback in the app, or contact the FitCoach team that invited you.</p>
  );
}
