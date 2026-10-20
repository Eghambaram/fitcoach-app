# ADR-0013: Email through an EmailProvider abstraction (SMTP, Resend, console)

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D13)

## Decision
`EmailProvider.send()` with adapters `smtp` (Mailpit locally, any SMTP in production), `resend`, and `console` (writes to `email_outbox`; refused when `APP_ENV=production`).

## Why
Auth emails are now our responsibility; the abstraction keeps local development offline-friendly.

## Consequences
- The MVP sends auth emails only (verify, reset, client OTP, invite fallback); trainer email notifications are v1.1.
- Every send writes `notification_deliveries` with the provider status.
- Sends go through a pg-boss queue with retries and backoff.
