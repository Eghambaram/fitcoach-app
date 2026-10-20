# ADR-0029: Audited `pnpm beta:invite` CLI before the platform UI

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 0.1 Q4; §16.0, §12.2

## Decision

Step 1.3 adds a CLI (`pnpm beta:invite create --uses <n> --expires <duration>`, `list`, `revoke <id>`) that writes hashed codes to `beta_invites` through the same service the step 6.1 platform UI will use. Each action writes `audit_logs`. The plain code is printed once and never stored.

## Why

With `SIGNUP_MODE=invite_code`, nobody can sign up (including on staging) until codes exist, and the platform UI arrives only in step 6.1.

## Consequences

- Runs against the database through `SystemDb` (like `platform:grant`).
- The 6.1 UI is a thin layer over the existing service.
