# ADR-0019: Client access via a WhatsApp-shared one-time login link; email OTP fallback

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D19, §8.3, §12.2)

## Decision
The trainer taps "Invite via WhatsApp" → the API creates a `client_invite` token (32 random bytes, hashed, 7-day expiry, single use; regenerating revokes older ones) → `wa.me` opens with the invite template → `/invite/[token]` consumes it and creates a 60-day session. Re-login: 6-digit email OTP or a fresh link. No SMS.

## Why
Email-only OTP is friction for many Indian clients; SMS in India needs DLT registration and costs per message.

## Consequences
- Clients without an email can only re-login through a new invite link from their trainer.
- Clients without a phone get the link by email.
- Invite acceptance is rate-limited and reveals no client data before the token is consumed.
