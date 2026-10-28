# Runbook: delete a client's or lead's data on request

In the MVP, deletion is a **manual, audited procedure** run by the platform owner (PROMPT §12.4). The automated 7-day workflow is v1.1. ADR-0063.

## When

- A client asks their trainer, or FitCoach, to delete their data.
- A lead (someone who enquired but never became a client) asks the same.
- A trainer asks to remove a client they added by mistake. Archiving is enough for most cases; deletion is permanent.

Confirm the request comes from the person (or their trainer, for the trainer's own records). Keep a reference, such as the email date or a ticket number. It goes into the audit log as the reason.

## What the command deletes

**`client`** removes:

- The client row, and with it every row that belongs to the client:
  - goals, consents, notes and measurements;
  - check-ins and their revisions;
  - packages, payments and the session ledger;
  - appointments and their history;
  - workout sessions and sets;
  - program assignments, invites and progress shares.
- The lead the client was converted from (the same person).
- The client's app login and sessions, unless the same login also belongs to a client of another trainer.
- In-app notifications that point at any of those rows, for example "Check-in from Asha Rao".

**`lead`** removes a lead that never became a client, along with its follow-ups, contacts, activity, consents and trial appointments. A converted lead is refused: delete the client instead.

**What stays:**

- **Audit log entries:** immutable, ids only, no names.
- **Product events:** ids only; the client's user id is cleared.
- **Data exports** the trainer already downloaded. Stored export zips are deleted within 24 hours.
- **Backups:** dumps that already contain the person age out within 35 days (`backups/daily/` 7 days, `backups/weekly/` 28). Say so when you confirm the deletion.

## Find the ids

1. Platform → **Trainers** → open the trainer → copy the **workspace id** from the URL (`/platform/trainers/<workspaceId>`).
2. The client or lead id: ask the trainer to open the client or lead in their app and send you the URL. It ends in `/app/clients/<clientId>` or `/app/leads/<leadId>`. Platform owners don't browse client data (rule 8).

## Run it

The command runs as the database **owner** role. It runs against the environment whose `DATABASE_OWNER_URL` it sees.

- **Staging or production on Railway:** run it inside the API container, which has the right variables:

  ```bash
  railway link                 # fitcoach project, the right environment
  railway ssh --service api
  # inside the container:
  node dist/cli/data-delete.js client <workspaceId> <clientId> --reason "Email from client 2026-11-08"
  ```

- **Locally:** `pnpm data:delete client <workspaceId> <clientId> --reason "…"`

1. **Dry run first:** without `--confirm` nothing is deleted. The command does the whole deletion inside a transaction, prints what it would remove (row counts, whether the login goes), and rolls back. Check the counts make sense.
2. **Then for real:** add `--confirm`:

   ```bash
   node dist/cli/data-delete.js client <workspaceId> <clientId> --reason "Email from client 2026-11-08" --confirm
   ```

   It prints the same report, and writes one audit entry: `client.data_deleted` or `lead.data_deleted`, actor `cli`, with the reason, the counts and the operator.

3. **Check:** Platform → **Audit Logs** → action `client.data_deleted` shows the entry. The trainer no longer sees the client.
4. **Reply** to the person: the data is deleted now, and copies in backups expire within 35 days.

## If it fails

- **"No client with that id in that workspace."** The ids don't match. Check both; the workspace id comes from the platform URL.
- **"This lead became client …"** Delete that client instead. The lead goes with it.
- **Anything else:** the transaction rolled back, so nothing was deleted. Send Claude the message (it never contains personal data).
