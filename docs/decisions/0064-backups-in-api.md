# ADR-0064: Nightly backup inside the API by default (Railway Hobby beta)

- **Status:** Accepted (amends ADR-0063)
- **Date:** 2026-10-28
- **Source:** Step 6.2 follow-up; §17.2, §17.5, §16.0 health

## Context

The beta runs on the existing Railway **staging** environment, on the **Hobby** plan, without a custom domain:

- Railway's built-in Postgres backups need the Pro plan.
- The owner wants no extra Railway services or settings until production is set up next month.

ADR-0063's separate `db-backup` cron service works on Hobby, but it is one more service to create and configure.

## Decision

1. **`NIGHTLY_BACKUP` setting** (API) — values `in_api` (default), `external` or `off`.
2. **`in_api` mode:** the API runs the backup itself as a pg-boss job.
   - **Schedule:** `backups.nightly`, `30 20 * * *` UTC (02:00 IST), once per tick across replicas.
   - **Steps:** the same as `infra/db-backup` (shared code: `@fitcoach/shared` `backup-plan`):
     1. `pg_dump -Fc` with `DATABASE_OWNER_URL`, which the API already has for migrations;
     2. `pg_restore --list`;
     3. upload to the private bucket at `backups/daily/` (and `backups/weekly/` on Sundays);
     4. retention;
     5. a `backup_runs` row, written directly. No heartbeat is needed in-process.
   - **Failures:** recorded and logged with URLs scrubbed. They are not retried in a loop; the next night tries again.
   - **Image:** the API image now includes `postgresql-client-${PG_MAJOR}` (17).
3. **"Run backup now"** on Platform → System Health: `POST /v1/platform/backups/run` (AAL2, audited `backup.run_requested`) queues `backups.run`. It shows only when the in-API backup can run here (`canRunBackup`).
4. **Health → Backups** reads `backup_runs` whatever wrote it. It says **Not configured**, with what's missing, when:
   - the mode is `off`;
   - the mode is `external` without a heartbeat token;
   - the mode is `in_api` without storage or `DATABASE_OWNER_URL`.
5. **Production rules:**
   - `off` is refused.
   - `external` needs `BACKUP_HEARTBEAT_TOKEN`.
   - `in_api` needs `DATABASE_OWNER_URL`.
   - The production guide uses `external` (the separate service), as in PROMPT §17.2.

## Consequences

- **Beta on staging:** nightly off-platform backups with **no Railway change**. The first run happens the next night, or immediately with "Run backup now".
- **Production cost:** the API does a few seconds of `pg_dump` work each night. That's fine at beta size. The separate service keeps that load out of the API when the database grows; switch with `NIGHTLY_BACKUP=external` when the db-backup service exists, so you don't take two dumps.
- **Versions:** the Postgres major version is pinned in the API image too. Railway Postgres upgrades need `PG_MAJOR` bumped first.
- **Verification:** checked in the real API image (`docker compose --profile full`): a queued run produced a 2.4 MB dump in `backups/daily/` and a `succeeded` row. CI repeats this on every PR.
