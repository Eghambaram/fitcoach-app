# ADR-0018: Client packages, sessions remaining and manual payments are core MVP

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D18, §8.3A)

## Decision

`client_packages` (session_pack / time_based / online_coaching), `package_session_ledger` and `client_payments` ship in the MVP. Payments are recorded by the trainer (cash/UPI/bank/card/other); FitCoach processes no client payments.

## Why

Trainers' biggest weekly pain is "who has sessions left / who hasn't paid".

## Consequences

- Session deduction happens only in the attendance transaction (unique per package + appointment); un-marking writes a reversal row.
- Ledger and payments are append-only (voids are new rows).
- Clients see sessions left and expiry only — never prices, amounts or payment records.
- Time-based and online packages do not deduct sessions; "N per week" is informational in the MVP (open question in `docs/mvp-plan.md`).
