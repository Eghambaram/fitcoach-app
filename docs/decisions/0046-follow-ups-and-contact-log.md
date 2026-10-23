# ADR-0046: Follow-ups, the communication log and WhatsApp click-to-chat

- **Status:** Accepted
- **Date:** 2026-10-23
- **Source:** Step 2.3; §8.2, §8.10, §11, CLAUDE.md rules 19 and 20d

## Decision

(1) **Due days are workspace days.** A follow-up is entered as a local date + time and the API turns it into `due_at` in the workspace time zone. _Overdue_ means due on an earlier day, and _today_ means due today, even if the time has already passed. The API computes the state, and the web only formats it. Past dates and dates more than a year ahead are refused. (2) **`leads.next_follow_up_at` and `last_contact_at` are trigger-maintained.** The triggers run as the caller, not as SECURITY DEFINER, so the lead's own RLS still applies. `fitcoach_app` gets UPDATE on just those two columns. (3) **Follow-ups are final once finished.** Done needs an outcome, and skipped doesn't. Both set `completed_at`. The UPDATE policy only matches open rows, and nobody can DELETE. Completing a follow-up can also log the contact and schedule the next one, all in one transaction. A repeated identical submit is a no-op, and a different answer is a 409. Because `FOR UPDATE` applies the UPDATE policy, finished rows are read without a lock. (4) **`communication_logs` is append-only and is the source for "contact logged" timeline entries.** Those entries are merged in when the lead is read, not copied into `lead_activities`. A contact on a lead that is still New moves it to Contacted, with a `stage_changed` entry marked `automatic`. (5) **WhatsApp stays honest.** The API renders the workspace's `follow_up` template (falling back to the global default) and returns `{ purpose, text, url }` with every list item and lead detail, so the button is a real link. After it opens, the app asks "Did you send it?". Only "Yes, I sent it" writes a `communication_logs` row (`message_sent`, with the template purpose), and nothing claims delivery. Archived and converted leads just open the chat. (6) **Reminders are a stored preference** (`none | in_app`). The UI says in-app reminders start with notifications (step 5.2), so it never claims a reminder was sent. (7) **The list's default sort is now "Next follow-up"** (open ones first, then leads with none), per §8.2. The follow-up filter options are due, overdue, today, next 7 days, and none. A "Follow-ups due" KPI shows the overdue count. (8) Follow-ups and contacts are refused on archived and converted leads. Converted leads will be followed up from the client profile.

## Why

Trainers in one city work in one time zone, but servers run UTC and browsers can travel. A single definition of "today" keeps the list, KPIs and drawer consistent. A click-to-chat link can't know whether a message was sent, so only the trainer's confirmation counts.

## Consequences

- `communication_logs.lead_id` is NOT NULL for now. Step 3.1 relaxes it, adds `client_id` (expand) and a `num_nonnulls` check.
- Step 2.4 (conversion) must close or skip open follow-ups inside the conversion transaction, before the lead becomes `converted`, because the lead's UPDATE policy refuses changes to converted leads.
- Step 5.2 generates `follow_up_due` notifications for `reminder = 'in_app'`. It shows "sent" only when a `notification_deliveries` row exists.
