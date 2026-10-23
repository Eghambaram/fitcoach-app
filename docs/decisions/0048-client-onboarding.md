# ADR-0048: Client onboarding wizard, drafts, consents and baseline measurements

- **Status:** Accepted
- **Date:** 2026-10-23
- **Source:** Step 2.5; §8.4, §8.8, §12.3, CLAUDE.md rules 16 and 19

## Decision

1. **Drafts are a separate table** (`client_onboarding_drafts`, JSON answers + step).
   - A brand-new client's draft has no `client_id`. Saving it doesn't create a client, so half-finished drafts never take a plan slot or show up as duplicates.
   - A converted lead's draft points at the `onboarding_draft` client created by conversion. There's one open draft per client, so saving again from a second tab continues the same draft.
   - Finished drafts keep `finalized_at`; none are deleted.
2. **Saving and checking:**
   - "Save as draft" stores anything typed that fits the draft shape, with only types and lengths checked.
   - "Next" validates the step with the shared `onboardingFieldsSchema` and then saves.
   - Create validates everything again on the API.
   - After the first save the URL becomes `?draft=<id>` (via `history.replaceState`, no reload), so a refresh or a return visit resumes the same draft.
3. **Finalize is one transaction, with `Idempotency-Key`.** It:
   - creates the client, or updates the converted one;
   - activates it (the plan-limit trigger applies) and sets `onboarded_at`;
   - writes the primary and secondary `client_goals`;
   - writes `client_consents` for data processing (required) and progress photos (separate, optional; declined is recorded too), each with the notice version and the exact text;
   - writes baseline `measurements` in canonical units;
   - finishes the open drafts and records `activity_events` / `client_onboarded`.

   A phone or email used by another non-archived client is refused with the other client's name.

4. **Measurements are append-only.** Units come from the workspace settings, and the API converts them to kg / cm. Plausible ranges are checked in canonical units to catch typos such as 725 kg. The only update is voiding a live row (signed, with a reason), and nobody deletes. Six global `measurement_types` ship as reference data, and a trigger refuses another workspace's type. Custom types are v1.1.
5. **Optional fields never block creation.** The required fields are full name, primary goal, training mode and the data-processing consent.
   - Photo upload is left to the client profile (step 3.1); the avatar pipeline from 1.5 needs a client id first.
   - Package and program show disabled with "Available after packages / programs are set up".
   - "Invite via WhatsApp" shows disabled until step 4.1.
6. **Limitations and the emergency contact are trainer-only columns.** The client portal views (4.1+) must not expose them.
7. **Entry points:** "Add client" on the dashboard, the drafts list at `/app/clients/new`, and "Client onboarding" on a converted lead (which shows "already onboarded" once done). The Clients nav item stays "Coming soon" until step 3.1.

## Why

Trainers onboard between sessions on a phone, often in two sittings. Drafts must survive that without creating half-clients. Consent and measurements are evidence and history, so they are never rewritten.

## Consequences

- `clients` now allows trainer UPDATE of the profile columns and status (not `archived`; archiving arrives with step 3.1's lifecycle and `archived_at`).
- Step 4.4 builds charts and voiding UI on `measurements`; step 3.1 shows goals, consents and limitations on the client detail.
