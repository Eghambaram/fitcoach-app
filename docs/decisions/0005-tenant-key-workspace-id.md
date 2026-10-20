# ADR-0005: Tenant key is workspace_id; one workspace per trainer

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D5, §4.4)

## Decision

Every tenant-owned row carries `workspace_id`. In the MVP each trainer owns exactly one workspace (`workspace_members.role = 'owner'`). Multi-trainer Studio stays disabled.

## Why

Keeps the model Studio-ready without a later migration, while keeping MVP permissions trivial.

## Consequences

- Child tables also carry `workspace_id` with composite FKs `(workspace_id, parent_id)`.
- Tenant identity always comes from the session, never from body, query or params.
- Adding Studio later means new roles in `workspace_members`, not a data migration.
