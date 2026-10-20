# ADR-0033: Default active-client limit of 50 for beta workspaces

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 0.1 Q12; §17.3

## Decision
`BETA_DEFAULT_CLIENT_LIMIT` defaults to `50`. New workspaces get the `beta` plan with this limit in `workspace_plans`; the platform owner can change it per trainer.

## Why
Comfortably above the 10–40-client beta user while still exercising the `PLAN_LIMIT` path.

## Consequences
- Conversion, onboarding finalize and restore-from-archive respect the limit (service check + DB trigger).
