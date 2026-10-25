# ADR-0049: Calendar, recurring series, trials and attendance

- **Status:** Accepted
- **Date:** 2026-10-23
- **Source:** Step 2.6; §8.6, §8.2 trial booking, §10.3, D22, D25, CLAUDE.md rule 19 and gotchas

## Decision

1. **Times are entered and shown in the workspace time zone.**
   - The API converts the local date and time with `(date + time) at time zone <workspace tz>` and stores a timestamptz. Each appointment also records its IANA zone.
   - Responses carry the local `date`, `startTime` and `endTime`, so the browser's own zone never matters.
   - `ends_at` is set by a trigger, because `timestamptz + interval` isn't immutable and so can't be a generated column.
2. **No double-booking**, enforced in two layers:
   - The exclusion constraint on `(workspace_id, tstzrange(starts_at, ends_at))` for scheduled/confirmed appointments is the guarantee (23P01 → `CONFLICT_APPOINTMENT`).
   - The service checks first, so the message can name the clash: "You already have Asha Rao — Session at 7:00 AM." Back-to-back sessions are fine.
   - One person per appointment (D22).
3. **Recurring series** set the weekdays, time and length, plus either an end date or a session count.
   - At most 52 sessions; an open date range is capped at 52 and says so.
   - "Check dates" previews every occurrence with its conflict, and conflicting dates are skipped by default.
   - Create expands everything in one transaction. Any conflict not explicitly skipped is listed per date and nothing is saved.
   - "Move" means: skip the date now, book it separately later.
4. **Changing a recurring session:**
   - "This and following" changes the time, length and place of this and the later live occurrences, and updates the series pattern. Past and finished rows are untouched.
   - Moving to another day is "this occurrence" only.
   - Changing the weekdays means ending the series ("cancel this and following") and creating a new one, so history stays exact.
5. **Cancelling** takes a reason.
   - A client session cancelled inside the workspace's late-cancel window (D25), or after it started, is flagged `late_cancel`.
   - A cancelled appointment is final; the RLS update policy excludes it.
   - "Cancel this and following" ends the series.
6. **Attendance** (attended or no-show) can be marked only once a session has started.
   - Undo returns it to scheduled. Repeating the same mark is a no-op.
   - Past unmarked sessions are listed on the calendar with one-tap buttons until marked.
   - Every change is in the insert-only `appointment_changes`.
7. **Package hook:** attendance, undo and late cancellation call `SessionDeductionService.applySessionUse()` in the same transaction. It is deliberately empty until step 3.2 writes `package_session_ledger` rows. No package is touched before packages exist.
8. **Trials:**
   - Booking a trial from the lead drawer moves a New/Contacted/Interested lead to Trial booked, with an automatic `stage_changed` entry.
   - The lead timeline records trial booked / attended / no-show / cancelled, and the leads KPIs gain "Upcoming trials".
   - The outcome never converts a lead (§8.2).
   - Leads can book only trials and consultations.
9. **Views:** week and day on desktop; agenda and day on phones (without a chosen view, phones get the agenda and larger screens the week). Month view and availability shading are v1.1. Trials, needs-attendance, attended and no-show differ by label and colour together, never by colour alone.

## Why

Double-booking and silently dropped series occurrences are the scheduling failures trainers notice first. Explicit per-date conflicts and a database backstop make both impossible.

## Consequences

- Step 3.2 implements `SessionDeductionService` (ledger rows, reversals, the D25 policy flags) and must keep it inside these transactions.
- The client portal (4.2) reads appointments through a view without `notes`.
- The dashboard (5.1) reuses `GET /v1/appointments` and `/needs-attendance` for "Today" and "Needs attention".
