# ADR-0047: Lead → client conversion, the clients table and Idempotency-Key

- **Status:** Accepted
- **Date:** 2026-10-23
- **Source:** Step 2.4; §8.2, §8.3, §10.3, §4.3, ADR-0033

## Decision

1. **Conversion creates an `onboarding_draft` client.** "Convert & Continue" lands on `/app/clients/new?fromLead=<id>`, where the step 2.5 wizard will finish onboarding and move the client to `active`. Until 2.5 ships, that route only confirms the conversion and says onboarding is coming next. It doesn't pretend the wizard exists.
2. **The plan limit counts `active` and `onboarding_draft` clients**, so a conversion can't later fail at activation. The service checks it inside the transaction (`PLAN_LIMIT`, 409). A `BEFORE INSERT OR UPDATE OF status` trigger on `clients` enforces the limit on every move to `active` (SQLSTATE `FC001` → `PLAN_LIMIT`). Both take the same per-workspace advisory lock, so concurrent requests can't both take the last slot.
3. **Exactly one client per lead:**
   - `clients(workspace_id, source_lead_id)` is unique.
   - The lead is locked with `SELECT … FOR UPDATE`.
   - `Idempotency-Key` replays the first answer.

   `FOR UPDATE` applies the UPDATE policy, which hides converted leads, so a lead that another request just converted is re-read without a lock and answered with its existing client.

4. **Linking.** If a non-archived client already has the lead's phone or email, conversion answers `CONFLICT_DUPLICATE` with the client's id in `fieldErrors.linkClientId`. The sheet then offers "Link to …", which marks the lead converted against that client and creates nothing.
5. **Leads RLS.** `converted` can now be set through RLS, but only together with `converted_client_id` (composite FK to a client in the same workspace) and `converted_by_user_id = current_user_id()`. The USING clause excludes converted leads, so a converted lead is final. The service answers 409 for edits, archive, stage changes, follow-ups and contacts on a converted lead.
6. **In the same transaction**, conversion:
   - skips the lead's open follow-ups (reason `converted`);
   - writes `stage_changed` and `converted` timeline entries, an `activity_events` row (`lead_converted`) and the `lead_converted` product event (no PII).

   Any failure rolls back all of it.

7. **`IdempotencyService`** stores the key inside the request transaction. A concurrent request with the same key waits on the unique index, then replays the stored answer, or runs itself if the first one rolled back. A different body under the same key gets `IDEMPOTENCY_KEY_REUSED` (422). The web creates one key each time the sheet opens.
8. **The initial package** is shown disabled ("Available after packages are set up") until step 3.2.

## Why

Conversion is the spine's hinge. Double taps on flaky mobile networks are expected, and a lead marked converted without a client would corrupt the funnel metrics.

## Consequences

- `clients` has trainer SELECT and INSERT only. UPDATE (onboarding finalize, status changes, editing) arrives with steps 2.5 and 3.1, and the client portal policies with 4.1.
- Step 2.5 replaces `/app/clients/new` with the wizard and must read `?fromLead=` to find the draft client.
- Lead deletion is already blocked by history. A converted lead also can't be deleted, because its client references it.
