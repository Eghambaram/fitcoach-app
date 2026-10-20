# ADR-0027: Postgres 17 locally until Railway's version is confirmed

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 0.1 Q3; §18

## Decision

`docker-compose.yml` and Testcontainers use the `postgres:17` image. When the Railway Postgres service is created (step 1.6), its major version is checked and local/CI images are aligned if it differs.

## Why

§18 requires the same major version locally as on Railway, and the Railway service doesn't exist yet.

## Consequences

- One-line change in compose and the test harness if Railway runs a different major.
- `pg_dump` in `infra/db-backup` must use a client at least as new as the server.
