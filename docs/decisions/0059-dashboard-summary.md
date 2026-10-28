# ADR-0059: Dashboard summary — one endpoint, fixed queries, shared metric definitions

- **Status:** Accepted
- **Date:** 2026-10-28
- **Source:** Step 5.1; §8.1, §8.1.1, §8.12, CLAUDE.md rules 19, 20, 20d, 21

## Decision

1. **One `GET /v1/dashboard/summary`** returns KPIs, the day's schedule, Needs attention, recent activity and the first-run checklist. Its cost doesn't grow with the data (no N+1):
   - the settings read;
   - one KPI query (scalar subqueries);
   - one schedule query, which finds each client's planned workout with a correlated subquery;
   - one capped query per attention group;
   - two template reads, only when there are payment or package items;
   - one activity query;
   - one checklist query.

   It runs as fitcoach_app under RLS and filters by the session's workspace.

2. **Metric definitions** live in `packages/shared/src/metrics.ts` (labels, definitions, attention order, windows) and `docs/metrics.md`. Every date boundary uses the workspace time zone ("end of today" = local midnight as a timestamp).
3. **KPIs are always for today.** `?date=` (prev/next day) moves only the schedule.
   - Sessions today: online = an online session or an appointment with a meeting link; trials are a separate count; in person = the rest.
   - The Payments due card also shows how many packages are expiring, since both point at money to collect.
4. **Needs attention** shows the nine groups of §8.1 in that order. Each is capped at 5 items with the true total and a link to the full filtered list; empty groups are left out.
   - Payment and package items have **Remind**, a WhatsApp click-to-chat built from `payment_reminder` / `package_renewal` with the amount, sessions left and package name.
   - Nothing is sent or logged as sent, because the contact log is lead-only (rule 20d).
   - "No recent check-in / measurement" uses the Settings thresholds. It only counts clients who have been clients that long, so a brand-new client isn't flagged on day one.
5. **Schedule actions:**
   - **Mark attendance** once a session has ended unmarked.
   - **Join** for online sessions with a link.
   - **Start** when the client has a workout planned that day (opens the live workout).
   - Otherwise **View**, which opens the calendar drawer.
6. **Recent activity** = the latest 10 `activity_events`, described by the same text as the client profile (`features/clients/activity.ts`).
7. **First-run checklist** steps tick themselves from data:
   - a published public page;
   - any lead or client;
   - any program assignment;
   - any client invite.

   It shows until all four are done or the trainer hides it (`trainer_settings.first_run_dismissed_at`, migration 0038).

## Why

The dashboard answers "what do I need to do today?" with numbers a trainer can check by hand. Sharing the definitions in one place keeps the numbers, the captions and the docs from drifting.

## Consequences

- Step 5.2's notifications (follow-up due, check-in submitted, sessions needing attendance, package expiring, payment due) should reuse these definitions.
- Adherence and attendance rates are defined in `docs/metrics.md` but not shown yet.
