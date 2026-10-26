# ADR-0052: Exercise library, starter templates and where they live in the navigation

- **Status:** Accepted
- **Date:** 2026-10-26
- **Source:** Step 3.3; §8.5, §6, D21, ADR-0021

## Decision

1. **Tables** (migration 0023): `exercises`, `programs`, `program_workouts` and `program_exercises`.
   - `workspace_id NULL` marks global reference data: the library and the starter templates. A global program must be a template (CHECK).
   - Muscle groups and equipment are `text[]` checked against fixed lists. The shared Zod enums mirror the same lists.
   - Planned exercises store sets, reps (a min–max range) **or** a duration, rest, an optional load and notes. Tempo and per-week progression are v1.1.
2. **Global vs tenant rows.** A composite FK with a NULL `workspace_id` isn't checked by Postgres, so:
   - Child tables also have a simple FK to their parent.
   - Triggers (`app.check_program_workout`, `app.check_program_exercise`, migration 0024) require child and parent to share `workspace_id` (both NULL, or equal).
   - A planned exercise may only use a global exercise or one of its own workspace's. A global template may only use global exercises.
3. **RLS** (0024):
   - Every trainer can read global rows and their own.
   - Custom exercises can be inserted (signed, writable workspace, no substitutions), edited and archived, but never deleted, because programs and logged sets will point at them.
   - Program tables are read-only for `fitcoach_app` until step 3.4 adds the builder's policies (expand → migrate).
   - Names are unique per workspace among live rows (`NULLS NOT DISTINCT`, so global names are unique too). An archived name can be reused, and a custom exercise may share a library name.
4. **Seed** (migration 0025): 109 exercises and the 7 starter templates from §8.5.
   - The SQL is generated from structured data and validated before writing: unique names, valid enums, every substitution and every template exercise present in the library.
   - The text is original and generic: instructions, safety notes, no media, no outcome claims. An API test checks the descriptions for claim words.
   - `days_per_week` equals the number of workouts in each template.
5. **Substitutions** are an ordered `uuid[]` of library ids, set only by the seed. Custom exercises have none in the MVP. Arrays can't carry FKs, so the seed's validation is the guarantee.
6. **Navigation:** §6 has no "Exercises" item.
   - **Programs** becomes live in this step. It shows the starter templates (read-only, with a notice that copying and the builder are coming next) and links to `/app/exercises`.
   - The Programs nav item stays highlighted on `/app/exercises` (`SECTION_ALIASES` in `navigation.ts`).
   - Step 3.4 adds "My programs" and "Use template" to the same page.
7. **URL filters** on list screens now go through `useUrlQuery` (`lib/use-url-query.ts`). Each change starts from the URL still being navigated to, or the current one. Before this, a debounced search or two quick filter changes could undo each other. That was a real bug in the leads and clients lists, found by this step's e2e test.

## Why

A trainer must be able to build a real program in under 5 minutes (D21). That needs a usable library and sensible templates from day one, with no copied or invented content.

## Consequences

- Step 3.4 adds INSERT/UPDATE/DELETE policies for a workspace's own `programs`, `program_workouts` and `program_exercises`, copy-on-write from templates (`source_program_id`), and the builder UI.
- Step 3.5 logs sets against `exercises.id`; archived custom exercises stay valid there.
- Exercise media remains a link (uploads are v1.1). Seeded exercises show a neutral placeholder where media would be.
