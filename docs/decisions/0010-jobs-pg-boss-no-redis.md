# ADR-0010: Background jobs with pg-boss inside the API; no Redis

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D10, §13)

## Decision

pg-boss (Postgres-backed queue + distributed cron) runs in each API replica. Railway Cron is used only for the `db-backup` service.

## Why

Durable, retryable jobs with no extra infrastructure; `SKIP LOCKED` makes it safe with several replicas.

## Consequences

- Handlers are idempotent with dedupe keys; `boss.stop({ graceful: true })` on SIGTERM.
- App Sleeping must stay off for the API in production or schedules stop.
- pg-boss has its own schema and pool; `DB_POOL_MAX × replicas` plus the pg-boss pool must stay under `max_connections`.
