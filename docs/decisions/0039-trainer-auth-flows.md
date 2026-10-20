# ADR-0039: Trainer auth flows: verify before login, non-enumerating signup

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 1.3; §12.2

## Decision

Trainers must confirm their email before they can sign in (login answers `EMAIL_NOT_VERIFIED` and re-sends the link). Signup always answers 202 `accepted`: an existing email gets an "you already have an account" email instead of a second account, and the invite-code use is rolled back. Checks run in a fixed order — invite code, then page address, then email — so no error depends on whether an email is registered. Login answers the same 401 for an unknown email, a wrong password, a disabled account or a non-trainer, after the same argon2 work. Session, email-link and beta-code tokens are stored as HMAC-SHA256 keyed by `SESSION_SECRET`. Auth emails are sent after commit, in the background, and every attempt is recorded in `notification_deliveries`. Global default message templates and package presets are reference rows (`workspace_id IS NULL`) seeded by migration and copied into each workspace at signup.

## Why

PROMPT §12.2 requires email verification at signup and constant-time, non-enumerating responses. Keyed hashes mean a database leak alone can't be turned into working sessions or links. Reference rows in the database (rather than constants) satisfy "production reference data ships in migrations" and make "reset to default" a simple copy.

## Consequences

- A successful signup does slightly more database work than a duplicate one; argon2 hashing dominates both, and responses don't wait for email.
- Rotating `SESSION_SECRET` signs everyone out and invalidates outstanding links and unused beta codes.
- Login returns `{ ok: true }` and sets the cookie; the web reads `/v1/auth/me` for the profile.
- SIGNUP_MODE=approval creates workspaces as `pending_approval`; such trainers can sign in and see `/auth/me` but nothing workspace-scoped until the platform owner approves them (step 6.1).
