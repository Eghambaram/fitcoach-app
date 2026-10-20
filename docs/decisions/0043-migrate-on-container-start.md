# ADR-0043: Run migrations when the API container starts, not as a Railway pre-deploy command

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 1.6 staging setup; §17.2, §17.4

## Context

The first staging deploy ignored `apps/api/railway.json`. Railway built with Railpack until `RAILWAY_DOCKERFILE_PATH` was set, and the pre-deploy command never ran. The API then started against a database without the `fitcoach_app` / `fitcoach_system` roles, and failed with `28P01` in a restart loop. A start command entered in the dashboard (`migrate && start`) fixed it.

## Decision

The API image's CMD is `sh -c "node dist/db/migrate.js && exec node dist/main.js"`. Railway, `docker compose --profile full` and any other host run the same thing, with no platform-specific hook. `railway.json` keeps the builder, watch patterns, health check, restart policy and draining, but has no `preDeployCommand` or `startCommand`. Services set `RAILWAY_DOCKERFILE_PATH` and leave the dashboard's start and pre-deploy commands empty.

## Why

- **Same safety as pre-deploy.** A failed migration exits the container before it listens, so the health check never passes and Railway keeps serving the previous deployment.
- **Safe to repeat.** The migration is idempotent and takes an advisory lock, so restarts and several replicas starting at once are harmless.
- **Clean shutdown.** `exec` replaces the shell with Node, so SIGTERM on redeploy reaches the API and pg-boss stops gracefully.

## Consequences

- The API service always has `DATABASE_OWNER_URL` and `DB_*_PASSWORD`. It needed them anyway for the pre-deploy step; request traffic still uses only the `fitcoach_app` / `fitcoach_system` URLs, and config validation refuses the owner role for them.
- Each start re-applies the role passwords and checks migrations. That takes a second or two.
- Migrations must stay backward-compatible with the running release (expand → migrate → contract), unchanged from before.
