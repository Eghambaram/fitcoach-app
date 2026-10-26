# ADR-0051: Packages, the session ledger and manually recorded payments

- **Status:** Accepted
- **Date:** 2026-10-26
- **Source:** Step 3.2; §8.3A, D18, D25, ADR-0018, ADR-0025, ADR-0031

## Decision

1. **Tables** (migrations 0021 and 0022): `client_packages`, `package_session_ledger` and `client_payments`, each tenant-owned with composite foreign keys.
   - Money is `bigint` paise, bounded by CHECK constraints (price ≤ ₹10,00,000, amount due ≤ price), so the API can use plain JS numbers safely.
   - Ledger and payments are insert-only for both database roles.
2. **One active package per client** (partial unique index). Selling while a package is active is a **renewal**: one transaction locks the client, closes the old package and inserts the new one. The old package becomes `expired` if past its expiry date, otherwise `completed`, with the reason "Renewed".
   - Unused sessions are not carried over. A trainer can give them back with a manual adjustment on the new package.
   - **Cancel** (with a reason) closes a package sold by mistake.
   - Packages are never edited after the sale. Only the closing columns can change.
3. **Expiry is computed when packages are read.** An active package past `expires_on` shows as `expired` straight away, and sessions after that day don't use it.
   - It stays `active` in the database until it is renewed. The daily job in step 5.2 will flip the status and send notifications.
4. **The ledger stores a signed `sessions_used`**, not just a `uses_session` flag. Sessions used = `sum(sessions_used)`, sessions left = `sessions_included − used`.
   - A mark is +1, or 0 when the D25 policy says the session isn't used or the package is time-based (ADR-0031).
   - Un-marking writes a **reversal row** (−1 or 0) that points at the mark (`reverses_id`, unique).
   - Manual adjustments can be any non-zero number, always with a note. Positive uses sessions; negative gives them back.
   - This replaces the spec's `count(uses_session = true)`. A count can't net out reversals or give-backs.
5. **Idempotency** comes from two places:
   - The attendance transaction already locks the appointment row, and the hook does nothing when the open mark already has the target reason.
   - In the database, `UNIQUE (package_id, appointment_id, mark_no)`, where `mark_no` counts marks per pair.
   - The spec's `UNIQUE (package_id, appointment_id) WHERE reverses_id IS NULL` would block marking again after an undo, so it was replaced.
   - Switching attended ↔ no-show reverses the old mark and writes a new one.
6. **What deducts:**
   - attended → 1;
   - no-show and late cancel → 1 or 0 per the workspace's D25 policy;
   - an ordinary cancel or an undo → nothing new.
   - With no usable package, or 0 sessions left, attendance still saves and **no ledger row** is written ("recorded without a package"). Sessions left therefore never goes negative.
   - The appointment drawer asks first at 0 left: Renew package, or Record without package.
7. **Payments** are append-only. A void is a new row with the same amount, `voids_id` and a reason.
   - Balance = amount due − valid payments, never shown below zero.
   - Recording more than the balance is refused with the amount still due, to catch typos.
   - Payments are labelled "recorded manually" everywhere; FitCoach processes none.
8. **Quick sale during conversion and onboarding:** a preset plus a price, sold in the same transaction as the client (`initialPackage`).
   - The preset gives the name, kind, sessions and expiry (start + duration − 1 days). The start date is the coaching start date, or today.
   - Onboarding refuses a second package if one was already sold at conversion.
   - Custom packages are sold from the Packages tab.
9. **What clients see:** nothing yet, because the client portal arrives in step 4.1. `clientPortalPackageSchema` (strict: name, kind, sessions left, sessions included, expiry) is the only shape that portal may return. A unit test proves it rejects prices, amounts and payments.
10. **Client list filters:**
    - "Sessions running low" means sessions left ≤ the Settings threshold, or expiring within the warning days.
    - "Payment due" means a balance is left and the payment due date has come.
    - Dashboard groups and WhatsApp payment reminders come with the dashboard (step 5.1).

## Why

Trainers' main weekly question is "who has sessions left and who hasn't paid" (D18). A signed, append-only ledger and payment log answer it exactly, keep an audit trail, and make double submits and undos safe without ever updating history (rule 20b).

## Consequences

- Step 4.1 must build the portal's package tile from `clientPortalPackageSchema` only.
- Step 5.1 reuses `PackagesService.lowSessionsCondition` / `paymentDueCondition` for the dashboard and needs-attention groups.
- Step 5.2 adds the daily job that marks expired packages and notifies.
- Changing the D25 policy affects future marks only; existing ledger rows are never rewritten.
