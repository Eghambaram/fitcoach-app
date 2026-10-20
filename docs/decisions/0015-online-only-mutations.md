# ADR-0015: Mutations require connectivity; per-set idempotent saves; offline banner

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D15, §14)

## Decision
Each workout set saves immediately via `PUT /workout-sets/:clientUuid` (client-generated UUID, idempotent upsert). Unsaved input is kept as a local draft; an offline banner disables save buttons. No offline mutation queue.

## Why
No silently dropped writes; an offline queue is a large, risky feature for an MVP.

## Consequences
- Refreshing the live workout restores state from the API.
- The service worker is network-only for `/api/*` and authenticated HTML.
- The offline queue is Later.
