# ADR-0004: Drizzle ORM with SQL migrations as the source of truth

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D4, §10.6)

## Decision

Drizzle ORM (node-postgres driver). drizzle-kit generates table diffs into `apps/api/src/db/migrations`; constraints, RLS policies, triggers, functions and grants are hand-written SQL in the same migration. SQL migrations are authoritative; Drizzle schema files mirror them.

## Why

RLS, exclusion constraints, composite FKs and per-transaction `set_config` context need SQL-level control that higher-level ORMs hide.

## Consequences

- Every generated migration is reviewed and hand-edited.
- Forward-only, expand → migrate → contract; never edit an applied migration.
- Production reference data (exercises, templates, defaults, `beta` plan) ships in migrations, not the dev seed.
