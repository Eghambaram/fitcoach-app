# ADR-0065: Brevo HTTPS email for hosts that block SMTP (Railway Hobby beta)

- **Status:** Accepted
- **Date:** 2026-10-28
- **Source:** Beta on staging; §8.10 (auth emails), §17.3, D13

## Context

The beta runs on Railway's Hobby plan without a domain.

- **SMTP is blocked:** Railway blocks outbound SMTP below the Pro plan. With Gmail SMTP configured, sends failed with `Connection timeout`, so nobody received confirmation emails.
- **Resend needs a domain:** without a verified domain, Resend only delivers to the account owner's address.

## Decision

- **New provider:** `EMAIL_PROVIDER=brevo` with `BREVO_API_KEY`.
  - It sends through Brevo's HTTPS API (`POST https://api.brevo.com/v3/smtp/email`), which Railway doesn't block.
  - The sender comes from `EMAIL_FROM` (`Name <address>`). It must be a sender verified in Brevo, such as the FitCoach Gmail address. No domain is needed.
- **Errors carry the HTTP status only,** like the Resend provider: Brevo's response body can echo the recipient address.
- **Everything else is unchanged:** retries, `notification_deliveries` records and Platform Health → Email all work the same with the provider name `brevo`.

## Consequences

- **Free tier:** 300 emails a day, enough for a beta of 5–10 trainers and their clients.
- **Deliverability:** mail from a free-mail sender through a third party may land in spam more often. Brevo may rewrite the visible sender for free-mail addresses. Testers are told to check spam.
- **Later:** once the domain exists, switch to Resend (or Brevo) with domain authentication (SPF, DKIM, DMARC). Production rules are unchanged: `console` is refused, and any real provider is allowed.
