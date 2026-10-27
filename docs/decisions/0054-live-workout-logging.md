# ADR-0054: Live workout logging, device-generated set ids and the appointment link

- **Status:** Accepted
- **Date:** 2026-10-27
- **Source:** Step 3.5; §8.5, §8.3A, §8.6, CLAUDE.md rules 14–15 and 20b, ADR-0051, ADR-0053

## Decision

1. **Lifecycle.** `workout_sessions` moves `planned → in_progress → completed | skipped`. A CHECK keeps `started_at` and `completed_at` consistent with the status. Completed and skipped workouts are final: the RLS UPDATE policy only matches planned or in-progress rows.
   - Opening a workout (`GET /v1/workout-sessions/:id`) never changes it. Before it starts, the detail shows the planned exercises from the assignment snapshot (`id: null`).
   - Starting twice returns the same workout. Finishing needs at least one completed set; finishing twice is a no-op (and it honours `Idempotency-Key`). A workout can be skipped from planned or in progress; anything logged stays.
2. **Copy on start.** `POST …/start` copies the snapshot workout's exercises into `workout_session_exercises` in the same transaction. Later program edits never rewrite a logged workout.
   - **Substitution** is recorded per exercise, not per set: `exercise_id` is what was done and `planned_exercise_id` is what the program asked for (null = added during the workout). Suggestions come from the planned exercise's library `substitution_ids`.
   - **Add exercise** appends to this workout only, never to the program.
3. **Sets.** `PUT /v1/workout-sets/:id` is an upsert keyed by a UUID the device generates and reuses on retry (rule 15).
   - The same id with a different exercise or set number is refused (409).
   - If the device lost its id (a refresh before the response), an existing set with the same number is updated instead of duplicated (`UNIQUE (exercise, set_number)`).
   - Sets can't skip ahead: the number must be at most one past the highest logged set or the target. A completed set needs reps or a time.
   - Every mutation locks the session row first, so saves on one workout are serialized (rule 14).
   - Sets and exercises are written only while their workout is in progress (RLS through `app.workout_in_progress()`). They are never deleted; "not done" is an update.
4. **Appointment link.** When a workout starts, the API links the client's nearest `session` / `online_session` appointment of the day (workspace time zone) that isn't cancelled and isn't linked to another workout. A partial unique index allows one workout per appointment, and a trigger requires the same client.
   - **Finish offers "Mark attended".** It calls the existing `POST /v1/appointments/:id/attendance`, so package deduction stays in the one attendance transaction and ledger (rule 20b, ADR-0051). Finishing a workout never deducts by itself, and repeating the mark deducts once.
5. **Summary** (exercises done, sets, volume = Σ reps × kg, duration) is computed by the API and returned with every detail.
6. **Rest timer** runs on the device only; nothing about rest is stored.
7. **Offline:** every save button is disabled while offline (PROMPT D15) and the OfflineBanner shows. No offline queue in the MVP.
8. **`FOR UPDATE` and RLS.** Locking also applies the UPDATE policy, which hides finished workouts. The service falls back to a plain read, so those return 409 "can't change" instead of 404.

## Why

Logging at the gym on a phone must survive flaky connections and refreshes without losing or duplicating sets, and the package must be charged exactly once, through the same path as the calendar.

## Consequences

- Step 4.2 adds client-scope policies and reuses this UI and these endpoints for self-logging.
- Step 4.4 (progress) can read completed sets for estimates (labelled as estimates).
- Trainer and client feedback: only trainer feedback exists now (`trainer_feedback`); client feedback arrives with the client app.
