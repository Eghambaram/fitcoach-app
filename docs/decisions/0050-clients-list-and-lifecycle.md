# ADR-0050: Clients list, client profile and lifecycle

- **Status:** Accepted
- **Date:** 2026-10-25
- **Source:** Step 3.1; §8.3, §7.3, §12.4

## Decision

1. **List:** tabs for Active, Paused and Archived, with counts under the current search and filters.
   - An **Onboarding** tab appears only while a converted lead's client is still being onboarded, so those clients are never hidden.
   - Search covers name, email and phone; filters cover goal and training mode; sort is by name or newest, with keyset paging.
   - Each row shows the next booked session.
   - The "program", "last check-in" and progress columns, and their filters, arrive with the steps that create that data (3.4, 4.3, 4.4). They are left out until then, not faked.
2. **Profile** (`/app/clients/[id]`, tab in `?tab=`):
   - **Live data now:** the Overview (primary and secondary goals, weeks with you, sessions completed, next session, latest measurements in the workspace's units, details incl. trainer-only limitations and emergency contact, consent status, recent activity), the Schedule tab (upcoming and recent sessions) and private Notes.
   - **Progress** lists the latest measurements; charts and new measurements come in step 4.4.
   - **Packages, Workouts and Check-ins** show an empty state that says what will appear there. No sample data.
3. **"Weeks with you"** counts whole weeks from the coaching start date (or the onboarding day), in the workspace time zone. It is empty until onboarding is finished.
4. **Lifecycle:**

   | Action  | From                       | To                                                       |
   | ------- | -------------------------- | -------------------------------------------------------- |
   | Pause   | active                     | paused                                                   |
   | Resume  | paused                     | active                                                   |
   | Archive | any status except archived | archived                                                 |
   | Restore | archived                   | active if they were ever onboarded, otherwise onboarding |

   Every change writes an `activity_events` row, with the optional reason.

5. **What archiving does**, in one transaction:
   - cancels the client's future live sessions (reason "Client archived", never a late cancel, so no package session is used);
   - ends their series;
   - revokes their portal sessions through `SystemDb`, because the sessions belong to the client's own user, which a trainer's RLS context can't touch. That runs in its own transaction; revoking a little early is the safe direction.
   - Goals, consents, measurements, notes and past sessions are untouched.
6. **What restoring checks:**
   - the plan limit, through the activation trigger (`PLAN_LIMIT`);
   - phone and email uniqueness among non-archived clients. The refusal names the client who now uses that phone or email.
7. **Hard delete** is still impossible for both roles. Deleting a client is the v1.1 deletion workflow (§12.4).
8. **Private notes** live in `client_notes`, are append-only, and are never part of any client-facing view.
9. **The client picker** (`GET /v1/clients/options`) moves under the clients controller, ahead of `/:id`. The shared contract moves to `clients.ts`, which removes an import cycle between the clients and scheduling contracts.

## Why

Trainers pause and archive clients often (holidays, injuries, people moving away), but they need the history back when someone returns. Cancelling future sessions on archive avoids ghost bookings blocking the calendar.

## Consequences

- Step 3.2 adds the package card and the Packages tab, the "sessions left ≤ 2 / payment due" list filter, and "Record payment" to the quick actions.
- Step 4.1 sets `clients.user_id` and must keep revoking portal sessions on archive.
- Client profile editing (contact details, goals) and photo upload are not in this step. The current values come from onboarding.
