# ADR-0006: Layered authorization: NestJS guards plus Postgres RLS with a non-BYPASSRLS app role

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D6, §4.5, §10.5)

## Decision

Requests pass `SessionGuard → RolesGuard → WorkspaceGuard | ClientScopeGuard | PlatformMfaGuard`. All request queries run as `fitcoach_app` (NOBYPASSRLS) inside a transaction that sets `app.user_id`, `app.workspace_id`, `app.client_id` and `app.actor` via `set_config(…, true)`. `fitcoach_system` (BYPASSRLS) is used only through `SystemDb.run(reason, fn)`.

## Why

Defence in depth: a missed `WHERE workspace_id = …` in a repository cannot leak another tenant's data. Client health data makes this non-negotiable.

## Consequences

- Every new table ships with ENABLE + FORCE RLS, policies, grants and RLS tests in the same migration; CI fails on any public table without RLS (allow-list for global reference tables).
- Repositories still filter by `workspace_id` explicitly.
- Each `SystemDb.run` call is justified in code and audited when it changes data.
- Phase 1 is slower; accepted, because this is the cheapest moment to get it right.
