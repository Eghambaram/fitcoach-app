# ADR-0038: One transaction per request; system role for jobs and rate limits

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 1.2; §4.3, §4.5, §10.5, §13

## Decision

Every request handler runs inside one transaction on the `fitcoach_app` pool, opened by `DbContextInterceptor` with the RLS context applied — reads included, not only mutations. Handlers that never touch tenant data opt out with `@SkipDbContext()` (health). Repositories get the transaction from `DbContext.tx`, which throws outside a request. pg-boss connects as `fitcoach_system`; `app.check_rate_limit()` is executable only by `fitcoach_system`. Migrations are split: drizzle-kit generates table DDL, and RLS, grants and functions live in `--custom` migrations so the drizzle snapshots never drift.

## Why

`set_config(…, true)` only lasts for a transaction, so a read outside one would silently see nothing; one transaction per request makes that impossible and sends the response only after commit. Rate limits run before a session exists (login, OTP, enquiry, invite acceptance), which is already `SystemDb` territory. pg-boss needs to create queue partitions at runtime, which `fitcoach_app` must never be able to do.

## Consequences

- Each request holds one pooled connection for its duration; keep `DB_POOL_MAX × replicas` (+ the system and pg-boss pools) under `max_connections`.
- Jobs enqueued from a request are not part of the request transaction yet; use pg-boss's Drizzle adapter for transactional enqueue when a feature needs it.
- `idempotency_keys` stores the request hash and the original response (status + body) so replays return the same result; the service that uses it arrives with the first critical mutation (step 2.4).
