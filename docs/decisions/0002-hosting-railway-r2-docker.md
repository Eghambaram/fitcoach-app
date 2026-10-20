# ADR-0002: Hosting: Railway for compute and Postgres, Cloudflare R2 for files, Docker Desktop locally

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D2, §17)

## Decision
Staging and production run on Railway as four services per environment: `web`, `api`, `Postgres`, `db-backup` (cron). Files live in Cloudflare R2. Local development uses Docker Desktop with Postgres, Mailpit and MinIO standing in for R2.

## Why
No idle shutdowns for the API (pg-boss schedules live there); R2 gives 10 GB-month free with zero egress; local services expose the same Postgres, SMTP and S3 interfaces so the code path is identical.

## Consequences
- Services must listen on `::` for Railway private networking; private networking is unavailable at build time, so nothing calls the API during `next build`.
- R2's free tier is per Cloudflare account and shared by staging and production; the app enforces its own storage budget (§17.7).
- Railway usage is billed; production stays lean (1 replica each) and usage alerts are set.
