# ADR-0031: Time-based packages: "N per week" is informational

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 0.1 Q9; §8.3A

## Decision

`time_based` and `online_coaching` packages never write deducting ledger rows. An optional "N per week" value is shown on the package card but is not enforced and never blocks attendance.

## Why

The spec says "unlimited or N/week" without defining enforcement; enforcing weekly caps adds week-boundary and timezone rules that the beta doesn't need to prove value.

## Consequences

- Attendance on a time-based package records a non-deducting ledger row (`uses_session = false`) for history.
- Revisit if beta trainers ask for weekly caps.
