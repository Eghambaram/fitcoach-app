# ADR-0001: No Supabase — NestJS API + PostgreSQL, Next.js is UI only

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D1)

## Decision
The backend is a NestJS API talking to PostgreSQL. The Next.js app renders UI only and never connects to the database directly.

## Why
Avoid free-tier pausing and platform limits; keep full control over auth, data access, RLS context and background jobs.

## Consequences
- We own auth, sessions, email, rate limiting and jobs (ADR-0007, ADR-0010, ADR-0013).
- Every data access from the web goes through the API, so there is exactly one place that enforces authorization.
- More code to write in Phase 1 than with a BaaS; accepted as the cost of control.
