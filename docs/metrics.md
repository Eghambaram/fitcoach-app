# Metric definitions

The dashboard's numbers (PROMPT §8.1.1). The definitions in code live in `packages/shared/src/metrics.ts` (`METRIC_DEFINITIONS`, `ATTENTION_KINDS`). The queries live in `apps/api/src/modules/dashboard/dashboard.service.ts`.

**Today and every date boundary are in the workspace time zone** (Settings → Locale), not the server's UTC (CLAUDE.md rule 19). "End of today" is local midnight.

## KPI cards

| Card                | Definition                                                                                                                                                                                                                                                                  | Opens                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Sessions today      | Appointments of every kind starting today with status scheduled, confirmed or attended (completed). The caption splits in person / online / trials: online = an online session or any appointment with a meeting link; trials are counted separately; in person = the rest. | Calendar, day view    |
| Active clients      | Clients with status Active (not paused, archived or still onboarding).                                                                                                                                                                                                      | Clients               |
| New leads           | Leads created in the last 7 days, today included.                                                                                                                                                                                                                           | Leads                 |
| Follow-ups due      | Open follow-ups due by the end of today. Caption: overdue = open follow-ups whose time has passed.                                                                                                                                                                          | Leads, follow-ups due |
| Check-ins to review | Check-ins with no review yet (`reviewed_at IS NULL`). An edit by the client after review counts again.                                                                                                                                                                      | Check-ins             |
| Payments due        | Active packages whose payment due date is today or earlier and still have a balance (amount due minus recorded payments, voided payments excluded). Caption: packages expiring (below).                                                                                     | Clients, payment due  |
| Packages expiring   | Active packages with sessions left ≤ the low-sessions threshold, or an expiry date within the warning days (or already passed). Both thresholds are in Settings → Packages.                                                                                                 | Clients, running low  |

**Sessions left** = sessions included − the sum of the package's session ledger (deductions minus reversals, ADR-0051). It applies to session packs only.

## Needs attention

In this order, each group showing at most 5 items with the total count:

1. **Overdue follow-ups:** open, due time has passed.
2. **Follow-ups due today:** open, due between now and local midnight.
3. **Trials in the next 48 hours:** scheduled or confirmed.
4. **Payments due:** as the KPI. **Remind** opens WhatsApp with the `payment_reminder` template (amount and package filled in).
5. **Packages running low or expiring:** as the KPI. **Remind** uses the `package_renewal` template.
6. **Check-ins to review:** as the KPI, labelled self-reported.
7. **Sessions to mark attended:** ended, still scheduled or confirmed, within the last 60 days.
8. **No recent check-in:** active clients with check-ins on, who have been clients for at least N days and haven't sent a check-in in N days (N = Settings → Check-ins).
9. **No recent measurement:** active clients who have been clients for at least M days with no live measurement in M days.

Nothing is sent by FitCoach: the reminders open WhatsApp, and the trainer presses Send (CLAUDE.md rule 20d). No diagnoses or predictions are shown.

## Other definitions

- **Adherence** = completed ÷ planned workout sessions in a period, only where a plan exists. Not shown on the MVP dashboard yet.
- **Attendance** = attended ÷ (attended + no-show) appointments in a period. Not shown on the MVP dashboard yet.
- **Streak (client app)** = consecutive weeks, counted back from last week (plus this week once it's done), in which every planned workout was completed (ADR-0056).
- **Check-in due (client app)** = check-ins on, today is one of the client's check-in days, and none sent today (ADR-0057).

## Beta success metrics (product events)

The §1A.5 beta metrics are computed from `product_events` (ADR-0030, ADR-0061). The event names are in `packages/shared/src/product-events.ts`. Each event is written in the same transaction as the action it records, and carries ids, counts and enums only — no names, contact details, free text or health data. The platform owner computes these in step 6.1.

| Metric                | Definition (§1A.5)                                                                              | Events                                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Activation            | Within 7 days of signup: public page published **and** ≥ 3 clients **and** ≥ 1 program assigned | `trainer_signed_up` (start), `public_page_published`, `client_onboarded` + `lead_converted` (clients), `program_assigned` |
| Weekly active trainer | ≥ 3 sessions or workouts logged in a calendar week (workspace time zone)                        | `session_attended` (attendance marked completed) + `workout_completed` (trainer or client logged)                         |
| Lead capture used     | ≥ 1 public-page enquiry in the first 30 days                                                    | `lead_captured`                                                                                                           |
| Client engagement     | Invited clients submitting ≥ 2 check-ins a week                                                 | `client_invited`, `client_invite_accepted`, `check_in_submitted` (same-day edits count once per client and day)           |
| Retention             | Trainer weekly-active at day 30                                                                 | as weekly active trainer, in the week containing signup + 30 days                                                         |
| Willingness to pay    | Beta trainers who'd pay ₹499+/month                                                             | none — measured by interview                                                                                              |

Supporting events: `email_verified` (signup funnel), `trial_booked` (lead → trial funnel), `package_sold` and `payment_recorded` (packages used), `feedback_sent` and `data_exported` (beta operations).
