# ADR-0060: Notifications with dedupe keys, MVP jobs and recorded job outcomes

- **Status:** Accepted
- **Date:** 2026-10-28
- **Source:** Step 5.2; §8.10, §13, §17.7, CLAUDE.md rules 4, 12, 13, 20d

## Decision

1. **One notification per recipient and dedupe key.** `notifications.dedupe_key` is unique per recipient (e.g. `follow_up:<id>`, `package_expiring:<id>:<expires_on>`, `check_in:<id>`). Jobs insert with `ON CONFLICT DO NOTHING`, so a retry, two replicas or a restart never notify twice (the "Done when").
2. **Jobs** (pg-boss, UTC crons, all through `fitcoach_system` because they span workspaces):

   | Job                        | Schedule    | What it does                                                                                                                                        |
   | -------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `notifications.follow-ups` | every 5 min | open follow-ups now due or overdue (last 7 days)                                                                                                    |
   | `notifications.trials`     | every 5 min | trials starting within 2 h                                                                                                                          |
   | `notifications.attendance` | hourly      | sessions ended in the last 2 days, still unmarked                                                                                                   |
   | `packages.daily`           | hourly      | for workspaces where it's 07:00 locally: close packages past expiry (`expired`); notify low sessions, expiring within the warning days, payment due |
   | `workouts.plan-window`     | daily       | existing, ADR-0053                                                                                                                                  |
   | `files.purge`              | daily       | existing, ADR-0041                                                                                                                                  |
   | `maintenance.purge`        | hourly      | spent auth tokens / OTPs (after a day), expired rate-limit buckets and idempotency keys, sessions ended 30+ days ago, job runs older than 30 days   |
   | `storage.reconcile`        | weekly      | compares the `files` ledger with the buckets; reports orphans and missing objects; never deletes                                                    |

   Notifications go to the workspace owner, only in live workspaces (not suspended, pending or cancelled). Invite links aren't purged: their expired or used status is shown to the trainer.

3. **Every run's outcome** (succeeded/failed, duration, a small summary of counts, the error message) goes into `job_runs`, which only `fitcoach_system` can read and insert. It is kept 30 days, for the Platform Health page (6.1). A failure is rethrown so pg-boss retries it. Shutdown on SIGTERM stays graceful (existing).
4. **Notifications from actions,** inserted in the same transaction as the action:
   - **To the trainer:** new lead (existing), client accepted invite, check-in submitted (the first send only; edits don't re-notify).
   - **To the client, if they use the app:** program assigned, session booked (a series sends one summary), session moved, session cancelled. The cancel reason is never shown.
   - **RLS:** a trainer may insert only those client notice types, only for users linked to their clients. A client may insert only `check_in_submitted`, only to their workspace owner. Clients read and mark read only their own notices.
5. **Request code doesn't use `ON CONFLICT` for notifications.** Under RLS, `INSERT … ON CONFLICT` also checks the caller's SELECT policy against the new row, and a trainer can't read a notification addressed to their client, so the request failed with 403.
   - Instead, `notify()` inserts inside a savepoint and treats the unique violation as "already notified". The jobs keep `ON CONFLICT`, because they run as the system role, which RLS doesn't apply to.
6. **The bell** shows on the trainer's top bar (mobile header and a slim desktop bar) and in the client app header. It has the unread count, the latest 30, open to go to the link (marks read), and "Mark all read". It refreshes every minute.
7. **Auth email retries are in-process,** not a pg-boss queue. Up to 3 attempts with backoff (2 s, 15 s), each recorded in `notification_deliveries`.
   - **Why:** auth emails carry live sign-in links and codes. Putting them in a job table would keep usable secrets in the database (rule 12).
   - **Trade-off:** a crash during the backoff loses that email, and the user simply asks again (every flow has "resend").
8. **Export generation** is a job of the CSV export in step 5.3, not here.

## Why

Trainers need to be told about follow-ups, trials, unmarked sessions and money without checking every screen. Duplicate notifications would erode trust faster than none.

## Consequences

- Step 6.1's Platform Health reads `job_runs` (last run and status per job, failures).
- New notification types need a migration (CHECK on `notifications.type`) and, for request-path inserts, an RLS policy.
