# ADR-0025: No-show and late-cancel rule is a workspace setting

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D25)

## Decision
`trainer_settings` stores the policy. Defaults: a no-show uses a session; a cancel more than 12 h before the start does not; a late cancel (≤ 12 h) uses a session.

## Why
Matches common trainer policy while staying configurable.

## Consequences
- `appointments.late_cancel` is computed from the configured window at cancel time.
- Ledger reasons: `attended | no_show | late_cancel | manual_adjustment`.
- Changing the policy affects future attendance only; existing ledger rows are never rewritten.
