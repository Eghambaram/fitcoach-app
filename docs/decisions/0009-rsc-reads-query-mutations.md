# ADR-0009: Reads in Server Components, mutations via TanStack Query through /api — no Server Actions

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D9)

## Decision

Server Components read through `lib/api/server.ts` (typed client, session cookie forwarded over the private network). Client components mutate through `lib/api/browser.ts` → `/api` proxy, with TanStack Query for cache and invalidation.

## Why

One mutation path and one validation path (the API).

## Consequences

- No Next.js Server Actions for business data.
- All data-driven pages are dynamic; nothing calls the API at build time.
- Optimistic UI only with rollback.
