# ADR-0063: Nightly backups with a heartbeat, production-only checks, and audited manual deletion

- **Status:** Accepted
- **Date:** 2026-10-28
- **Source:** Step 6.2; §12.4, §16.0 (health), §17.2–§17.7, CLAUDE.md rules 4, 13, 16, 20

## Decision

1. **`infra/db-backup`** is a small TypeScript workspace package and its own Docker image.
   - **Image:** `node:24-bookworm-slim` plus PGDG `postgresql-client-${PG_MAJOR}`. `PG_MAJOR` is 17, matching Railway and docker-compose, because `pg_dump` must be at least the server's version.
   - **Schedule:** a Railway **cron** service (`30 20 * * *` UTC = 02:00 IST), restart policy Never.
   - **Each run:**
     1. `pg_dump --format=custom --compress=9` with the admin URL, because it must read past RLS.
     2. `pg_restore --list` on the file — an unreadable dump is never uploaded.
     3. `PutObject` to the private bucket at `backups/daily/<IST date>.dump`, plus a server-side `CopyObject` to `backups/weekly/` on Sundays.
     4. Delete dailies older than 7 days and weeklies older than 28 days. R2 lifecycle rules (8 and 35 days) are the safety net.
     5. POST a heartbeat to the API.
   - **On any failure:** it still sends a heartbeat (status failed, a short error with URLs scrubbed), then exits 1.
   - **Logs:** JSON lines, never URLs, keys or tokens.

2. **The heartbeat endpoint:** `POST /v1/internal/backups/heartbeat`.
   - **Who calls it:** a machine, not a browser, over Railway's private network.
   - **Auth:** `@Public()` plus a bearer token compared in constant time, `BACKUP_HEARTBEAT_TOKEN`, shared through `${{api.BACKUP_HEARTBEAT_TOKEN}}`. Rate-limited per IP. Without a configured token it answers 404.
   - **CSRF:** a new `@SkipCsrf()` exempts it from the Origin + `X-FitCoach-Request` check. That check protects cookie-carrying browsers, and the decorator is documented as never for cookie routes.
   - **Storage:** rows go to `backup_runs` (system-only, append-only even for the system role, checked: a success needs a `backups/` key and a size).

3. **Platform Health → Backups** is now real:
   - **Not configured:** no token.
   - **Unknown:** no heartbeat yet.
   - **Degraded:** the last run failed, or there was no good dump within 26 hours.
   - **OK:** otherwise, with the dump size, age and key.

4. **Production-only config checks** (the API exits with the variable named), on top of the existing ones (https origin, 32-character salt, no console email, Secure cookies, no OpenAPI docs, not the local encryption key):
   - object storage must be configured;
   - `STORAGE_PUBLIC_BASE_URL` must not be an `r2.dev` host;
   - `BACKUP_HEARTBEAT_TOKEN` must be set.

   Staging may use r2.dev and run without the heartbeat. An API test boots the app with production settings and checks that `/v1/docs` is 404.

5. **Restore** is documented and rehearsed (`docs/runbooks/restore.md`):
   - **Drill:** create the two app roles, `pg_restore --no-owner --exit-on-error` into a scratch Postgres 17, then `pnpm restore:check <url>`. That prints migrations and row counts and HEADs every live `files` object in R2, exiting 1 if any is missing.
   - **Real loss:** Railway volume restore first; the R2 dump into a new Postgres service when the volume is gone.
   - **Rehearsed:** the drill was run locally while building this step, against a dump produced by the real image.

6. **Manual deletion (§12.4 MVP)** is `pnpm data:delete client|lead <workspaceId> <id> --reason "…" [--confirm]`.
   - **Role:** it runs as the **owner role**, because deletion is the one thing the append-only grants must yield to.
   - **Dry run:** without `--confirm` it performs the deletion in a transaction, prints the report and rolls back.
   - **A client deletion removes:**
     - the client and its cascades;
     - the lead(s) it came from, in **one statement**, because client and lead reference each other;
     - the client's login, unless another client uses it;
     - notifications whose data points at any deleted row.
   - **What stays:** product events lose the user id. Audit entries stay (ids only).
   - **Leads:** a converted lead is refused (delete the client).
   - **Audit:** one `client.data_deleted` / `lead.data_deleted` entry with the reason and counts.
   - **Whole workspaces:** not deleted by this command. That's v1.1 with the automated workflow.

7. **Production releases** go through the `production` branch:
   - **Promote to production** (manual; gated by the `production` GitHub environment's required reviewers) fast-forwards it to a `main` commit whose Staging smoke passed. It never force-pushes.
   - **Production smoke** mirrors Staging smoke against `PRODUCTION_WEB_URL`.

## Why

- The spec requires an off-platform copy, because wiping a Railway volume deletes its volume backups.
- A dump nobody restores is a hope, not a backup. Hence the `pg_restore --list` check, the heartbeat on the health page, and a scripted drill.
- Deletion requests must be honoured in the beta without building the v1.1 workflow, and must leave a trail.

## Consequences

- Backups count against the shared R2 free tier: roughly (7 + 4) × dump size per environment. That's small at beta scale; watch it on Platform Health.
- The Postgres major version is now pinned in three places (Railway, docker-compose, `PG_MAJOR`). Upgrading Railway Postgres means rebuilding db-backup first.
- `data:delete` runs with full database privileges. It's only reachable through `railway ssh` into the API container (or locally), and every run is audited.
