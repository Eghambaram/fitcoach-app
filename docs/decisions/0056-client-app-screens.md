# ADR-0056: Client app screens, client-facing views and client self-logging

- **Status:** Accepted
- **Date:** 2026-10-27
- **Source:** Step 4.2; §9, §8.3 (feature flags), §8.5, §10.5, CLAUDE.md rules 7, 20c and 22; ADR-0054, ADR-0055

## Decision

1. **Screens and navigation.** The client app has Home, My workouts, Workout details, the shared live workout, Schedule, More (contact trainer, profile, help, sign out) and Profile. The bottom nav is **Home · Workouts · Schedule · More**.
   - Progress and Check-in join the nav with steps 4.3 and 4.4 (CLAUDE.md rule 22: nothing in navigation that doesn't work).
   - The home shows no check-in prompt and no shared-metric tiles yet; it never shows placeholders.
2. **Client-facing views for column restriction.** `client_portal_appointments` leaves out notes, cancel reasons and who booked. `client_portal_packages` leaves out price, amount due, payments and notes, and computes sessions left from the ledger.
   - The views are owned by the migration owner, filter on `app.portal_client_id()` + workspace and use `security_barrier`.
   - Clients have **no** policy on `appointments`, `client_packages` or the ledger.
3. **Client read policies** cover only their own rows: workout sessions, logged exercises and sets, assignment, goals, and their workspace's custom exercises.
   - The assignment snapshot and sessions still carry trainer-only fields: exercise trainer notes and trainer feedback. The client API removes them before responding, and a test checks the response.
4. **Self-logging** follows the client's `features.workoutSelfLogging` flag, which the trainer toggles on the Client app card (`PUT /v1/clients/:id/portal/features`).
   - **Database:** client write policies apply only with the flag on and the workout in progress (`app.client_workout_in_progress()`).
   - **Field guard:** a `BEFORE UPDATE` trigger lets a client change only the lifecycle (planned → in progress → completed) and `client_feedback`. Trainers can never write `client_feedback`. Column grants are per role, so this split can't be expressed with grants.
   - **Shared service:** `WorkoutsService` serves both actors through a session-derived scope, adding the client filter for clients. Skip, swap, add exercise and attendance stay trainer-only.
   - **No appointment link:** client starts don't link an appointment, because clients can't see appointments; attendance stays with the trainer.
5. **Client preferences** (contact preference, units) change only through `app.client_update_preferences()`, a `SECURITY DEFINER` function limited to the signed-in client's row. A client UPDATE policy on `clients` couldn't stop the role's other column grants (limitations, status…).
   - The workspace's default units come from `app.client_default_units()`, so `trainer_settings` stays trainer-only.
6. **Shared live workout UI.** `LiveWorkout` takes a `WorkoutApi` adapter (trainer or client endpoints). Trainer-only buttons are absent when the adapter lacks them. The client screen sends the client's own feedback ("How did it go?"), and the trainer sees it as "Client's feedback".
7. **Streak** = consecutive weeks in which every planned workout was completed. It counts back from last week, plus this week once it's all done; a week with nothing planned ends it.
   - **Estimated workout time** = Σ sets × (work + rest), with about 4 s per rep and 60 s rest when none is set. It is labelled as an estimate.
8. **Contact trainer** shows the trainer's name and photo with WhatsApp click-to-chat and Call, using the trainer's profile phone. There is no in-app chat (§8.10).

## Why

Clients must see only what is theirs and never prices, notes or other clients (Done when, rules 7 and 20c). The views make the database enforce the column cut instead of trusting every query. Reusing the 3.5 screen keeps one well-tested logging flow.

## Consequences

- Steps 4.3/4.4 add Check-in and Progress to the nav, the check-in prompt and the shared-metric tiles, with the same view/policy pattern (`progress_shares`).
- A trainer can turn self-logging off mid-workout. The client then can't save and sees the API's message; the trainer can finish the workout.
