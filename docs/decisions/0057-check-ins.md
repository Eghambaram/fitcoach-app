# ADR-0057: Check-ins — one per local date, same-day edits, trainer review and per-client days

- **Status:** Accepted
- **Date:** 2026-10-27
- **Source:** Step 4.3; §8.7, §9, §10.3, CLAUDE.md rules 16, 19, 20, 21, 22; ADR-0055, ADR-0056

## Decision

1. **One check-in per client per local date.** `check_ins` has `UNIQUE (client_id, local_date)`, where `local_date` is today in the workspace time zone (`app.workspace_today()`).
   - The client sends with `PUT /v1/client/check-in`, an `INSERT … ON CONFLICT DO UPDATE`. A double submit or a later edit updates the same row.
   - RLS only lets a client insert or update **today's** row, their own, with check-ins enabled. After local midnight the row is read-only.
2. **Same-day edits keep the earlier answers.**
   - A `BEFORE UPDATE` trigger counts each edit (`revisions`), and an `AFTER UPDATE` trigger (SECURITY DEFINER) copies the previous answers into `check_in_revisions`. Nobody inserts revisions directly, and nobody can change or delete them.
   - An edit after review clears the review, so the check-in returns to the inbox. The trainer's earlier reply is kept.
3. **Each side writes only its own columns** (trigger; column grants are per role). A client changes only their answers. A trainer changes only `reviewed_at`, `reviewed_by_user_id` (always themselves, by policy) and `reply`.
4. **Check-in days.** `clients.check_in_days` holds the client's own weekdays (1 = Monday … 7 = Sunday). NULL follows the workspace default from Settings → Check-ins: "daily" = every day, "weekly" = **Mondays**.
   - The per-client on/off is the existing `features.checkIns` flag.
   - A check-in is **due** when check-ins are on, today is one of the days, and none has been sent today. A client may still send one on other days.
   - Clients read the workspace default only through `app.client_check_in_frequency()`; `trainer_settings` stays trainer-only.
5. **Reminders (MVP).**
   - The client home shows a "Time for today's check-in" card while it's due.
   - The trainer's client Check-ins tab shows **Nudge on WhatsApp** while it's due. It is click-to-chat with the `check_in_nudge` template and `{link}` = `/client/check-in`; nothing is sent by the app and nothing is logged as sent (`communication_logs` is lead-only).
   - Email and web-push reminders are v1.1.
6. **Inbox** (`/app/check-ins`, now in the trainer nav):
   - Unreviewed first, then newest. "To review / Reviewed / All" tabs with counts, a feeling filter, and paging (30 at a time).
   - Each check-in has an optional reply and **Mark reviewed**. The client sees the reply on their check-in screen.
7. **Trends** on the client's Check-ins tab show energy, sleep and feeling (great = 5 … poor = 1) over 60 days with Recharts.
   - They are labelled "Self-reported … Not a medical assessment" (rule 21), and appear only with at least 2 check-ins.
   - Recharts is added to the web app here (step 4.4 uses it for progress charts).
8. **Client navigation** gains **Check-in** only when check-ins are on for the client, so the order is Home · Workouts · Check-in · Schedule · More. Progress joins with 4.4; Schedule then moves into More, as in §6.

## Why

Check-ins must take under a minute, never lose what the client said, and stay the client's own report. The trainer needs one place to work through them.

## Consequences

- Step 5.1's "Check-ins to review" KPI and "no check-in for N days" attention rule read `check_ins` (`reviewed_at IS NULL`, latest `local_date`).
- Step 5.2's "check-in submitted" notification hooks into `PUT /v1/client/check-in`.
