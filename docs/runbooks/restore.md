# Runbook: restore the database

How FitCoach's database is backed up, and how to restore it: as a **drill** (into a scratch database) or for **real** (after data loss). PROMPT §17.5, ADR-0063.

## What backs the database up

| Layer                     | Where                                              | When                          | Kept                   | Survives a wiped Railway volume |
| ------------------------- | -------------------------------------------------- | ----------------------------- | ---------------------- | ------------------------------- |
| Railway volume backups    | Railway → Postgres → Backups (Pro plan)            | daily + weekly (Railway)      | per Railway plan       | **no**                          |
| Nightly `pg_dump` (`-Fc`) | R2 private bucket `backups/daily/YYYY-MM-DD.dump`  | 02:00 IST (`30 20 * * *` UTC) | 7 days                 | yes (off-platform)              |
| Weekly copy (Sundays)     | R2 private bucket `backups/weekly/YYYY-MM-DD.dump` | Sundays                       | 28 days (lifecycle 35) | yes                             |

- **Who runs the dump:** the API's nightly job by default (`NIGHTLY_BACKUP=in_api`, ADR-0064), or the separate `db-backup` cron service (`infra/db-backup`, `NIGHTLY_BACKUP=external`). Both use the same keys and checks.
  - It checks each dump with `pg_restore --list` before uploading it.
  - It deletes copies past retention. The R2 lifecycle rules are a backstop.
  - It posts a heartbeat to the API.
- **Where you see it:** Platform → System Health → **Backups**.
  - **OK:** a good dump in the last 26 hours.
  - **Degraded:** the last run failed, or there was no good dump in 26 hours.
  - **Unknown:** no heartbeat yet.
  - **Not configured:** `BACKUP_HEARTBEAT_TOKEN` isn't set.
- **What the dump holds:** the whole database, including the `pgboss` and `drizzle` schemas, owned by the Railway admin user, with grants to `fitcoach_app` and `fitcoach_system`.
- **What it doesn't hold:** files. Files live in R2, which isn't versioned. Deletes are soft for 7 days, so restoring a database newer than 7 days finds its files.

## You need

- Docker Desktop (for `postgres:17` with `pg_restore`, the same major version as Railway).
- The repo with `pnpm install` done, for `pnpm restore:check`.
- Read access to the right R2 bucket: the Cloudflare dashboard, or that environment's R2 token.

## Drill: restore staging's latest dump into a scratch database (do this monthly)

1. **Get the dump.**
   - **Dashboard:** Cloudflare → R2 → `fitcoach-staging-private` → `backups/daily/` → newest `YYYY-MM-DD.dump` → **Download**.
   - **Or the CLI:** with the staging token in `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`:

     ```bash
     aws s3 cp s3://fitcoach-staging-private/backups/daily/2026-11-08.dump ./restore.dump \
       --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com --region auto
     ```

2. **Start a scratch Postgres** (nothing else connects to it) and copy the dump in:

   ```bash
   docker run -d --name fitcoach-scratch -e POSTGRES_PASSWORD=scratch -p 5544:5432 postgres:17
   docker cp ./restore.dump fitcoach-scratch:/tmp/restore.dump
   ```

3. **Create the two app roles, then restore.** `--exit-on-error` makes any problem stop the restore loudly. `--no-owner` gives every object to the scratch admin.

   ```bash
   docker exec fitcoach-scratch psql -U postgres -c "create role fitcoach_app login; create role fitcoach_system login bypassrls;"
   docker exec fitcoach-scratch createdb -U postgres fitcoach
   docker exec fitcoach-scratch pg_restore -U postgres -d fitcoach --no-owner --exit-on-error /tmp/restore.dump
   ```

4. **Check it.** Run this from the repo with staging's `STORAGE_*` values in your shell (or in `.env` temporarily). It prints the migrations and row counts, and checks that every live `files` row still has its object in R2:

   ```bash
   pnpm restore:check postgres://postgres:scratch@localhost:5544/fitcoach
   ```

   Expected:
   - **Migrations:** the number of migrations in `apps/api/src/db/migrations/meta/_journal.json`.
   - **Row counts:** plausible.
   - **Files:** `objects missing: 0`. The command exits 1 if any object is missing.

5. **Note the result** (date, dump name, counts, time taken) in your ops notes.
6. **Clean up:** `docker rm -f fitcoach-scratch` and delete `restore.dump`. It contains personal data.

## For real: production lost data

Decide which copy to use:

- **The Railway volume is fine and you need an earlier point in time** (a bad migration or an accidental mass change): use **Railway → Postgres → Backups → Restore**, picking the backup just before the incident. It's the fastest path. PITR, if your plan has it, gets closer still.
- **The volume or Postgres service is gone, or Railway backups are unusable:** restore the newest R2 dump into a new Postgres service:
  1. **Stop writes:** in Railway, scale **api** to zero (or remove its deployment) so nothing writes during the restore. Leave **web** up; it shows "temporarily unavailable".
  2. **Create a new Postgres service:** Railway → **+ Create → Database → PostgreSQL**, in the production environment, same major version. Note its name; keeping the name `Postgres` (delete or rename the broken one first) keeps all `${{Postgres.*}}` references working.
  3. **Restore the dump:** temporarily enable a **TCP proxy** on the new Postgres service (Settings → Networking) and restore from your machine:

     ```bash
     # roles first (passwords are reset by the API's migration on its next start)
     psql "<proxy admin URL>" -c "create role fitcoach_app login; create role fitcoach_system login bypassrls;"
     pg_restore --dbname "<proxy admin URL>" --no-owner --exit-on-error ./restore.dump
     ```

     Run `pg_restore` from the `postgres:17` image if it isn't installed: `docker run --rm -v "$PWD:/w" postgres:17 pg_restore --dbname "<url>" --no-owner --exit-on-error /w/restore.dump`.

  4. **Check the restore:** `pnpm restore:check "<proxy admin URL>"` with production's `STORAGE_*` values. Fix anything it reports before going on.
  5. **Bring the API back:**
     - Remove the TCP proxy.
     - Make sure the api variables reference the new service, and redeploy **api**.
     - On start, the migration bootstraps the role passwords, finds every migration already applied, and serves.
  6. **Check the app:**
     - `/api/v1/health/ready` is `ok`.
     - Log in, and open a client and a photo.
     - Platform → System Health is green, apart from Backups. Backups catches up after the next nightly run, or after you trigger the `db-backup` service by hand (Railway → db-backup → **Deploy**).
  7. **Record it:** write down what was lost (the time between the dump and the incident) and tell affected trainers honestly.

## Run a backup now (any environment)

- **In-API backup (default):** Platform → System Health → **Run backup now**. Backups turns OK within about a minute; the api log shows `nightly backup succeeded`.
- **db-backup service:** db-backup → **Deployments → Deploy** (or wait for the cron). The deploy log shows `dump started → dump ready → uploaded → retention applied → backup succeeded`.
- **Locally:** `docker compose --profile full --profile backup run --rm db-backup` writes to the local RustFS bucket and reports to the local API.

## When the Backups check is Degraded

| Detail on the health page                             | Look at                                                                                                                                                                                         |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pg_dump exited with code …: server version mismatch` | `pg_dump` is older than the server. Rebuild the image with `PG_MAJOR` = the Railway Postgres major version (`infra/db-backup/Dockerfile`).                                                      |
| `pg_dump exited …: connection …`                      | `DATABASE_URL` on db-backup isn't `${{Postgres.DATABASE_URL}}`, or the Postgres service was renamed.                                                                                            |
| `AccessDenied` / `NoSuchBucket`                       | The R2 token isn't scoped to the private bucket, or the bucket name is wrong.                                                                                                                   |
| No successful backup in 26 hours, no failure          | The cron didn't run: check db-backup → Settings → **Cron Schedule** `30 20 * * *`, and that the service has a successful build. A heartbeat that can't reach the API shows in db-backup's logs. |
