# ADR-0053: Program builder, assignment snapshots and the rolling session window

- **Status:** Accepted
- **Date:** 2026-10-26
- **Source:** Step 3.4; §8.5, §10.3, ADR-0052

## Decision

1. **Whole-program save.** The builder sends the entire program (`PUT /v1/programs/:id`). One transaction locks the program, deletes its workouts and planned exercises, and inserts them again in array order.
   - Positions always follow what the trainer sees, and reordering needs no position juggling.
   - Workout and exercise row ids change on every save. Nothing references them: assignments hold a snapshot, and logging (3.5) works from the snapshot.
2. **Copy-to-edit.** "Use template", "Duplicate" and "Save as template" are all `POST /v1/programs` with `fromProgramId`; `asTemplate` makes the copy a workspace template.
   - Starter templates stay read-only (403). A copy keeps `source_program_id`.
   - A blank program starts with one empty Monday workout, because `days_per_week ≥ 1` and every save needs at least one workout.
3. **Day slots are weekdays** (`day_number` 1 = Monday … 7 = Sunday), unique within a program. This matches the starter templates (1/3/5 → Mon/Wed/Fri). At assignment the trainer can move each workout to another weekday, still one workout per day.
4. **Reordering.** Native drag-and-drop on exercise rows, plus Move up/down buttons on every row and workout as the keyboard and screen-reader alternative (§7.4). No new dependency.
5. **Assignment** (`POST /v1/programs/:id/assign`, Idempotency-Key), in one transaction:
   - lock the client, who must be active;
   - end their current assignment and delete its _planned_ sessions from today on;
   - insert the assignment, with a `program_snapshot` (the program detail as JSON), the schedule and `ends_on = start + weeks × 7 − 1`;
   - plan the sessions.
   - Only the trainer's own, non-archived program with no empty workout can be assigned.
6. **Rolling window:**
   - Planned `workout_sessions` are generated in SQL from the schedule, from today (workspace time zone) or the start date, up to 28 days ahead or the end date. `UNIQUE (assignment, date, workout)` + `ON CONFLICT DO NOTHING` makes this idempotent.
   - The daily `workouts.plan-window` pg-boss job (00:30 UTC) extends every active assignment and marks ended programs `completed`, through `SystemDb` because it spans workspaces.
   - Archiving a client ends their program in the same transaction.
7. **RLS** (migration 0027, expanding 0024):
   - Trainers write their own programs (never delete them), workouts and planned exercises.
   - Assignments are insert-only except ending (`status`, `ended_at` on an active row).
   - Planned sessions can be inserted and deleted while `planned`; started sessions are history and can't be deleted. Logging updates arrive with step 3.5.
8. **Onboarding's "Program (optional)"** stays a disabled select whose hint says to assign from the client's profile. Assigning needs a schedule and start date, which belong to the assign sheet, not the wizard.

## Why

Trainers must go from template to assigned program in minutes (Done when: under 5 minutes). Snapshots keep what a client follows stable while the trainer keeps improving the program.

## Consequences

- Step 3.5 reads the snapshot for the live workout, adds `workout_session_exercises` / `workout_sets` and the status updates on `workout_sessions`.
- Step 4.2 shows the client their upcoming sessions from the same table.
- Step 5.1 can count "sessions today" from planned workouts plus appointments.
