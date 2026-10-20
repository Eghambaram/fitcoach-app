# ADR-0042: Railway staging pipeline: one image per app, e2e against the images, smoke through the web origin

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 1.6; §17.1–§17.6

## Decision

(1) Each app has a Dockerfile built from the repo root with `turbo prune --docker`, on `node:24-bookworm-slim`. The API image is produced with `pnpm deploy --prod --legacy`, which gives it production dependencies and `dist/` only (`"files": ["dist"]`). The operator CLIs are compiled into the image (`node dist/cli/beta-invite.js`). The web image is Next.js `output: "standalone"` with `HOSTNAME=::`. (2) `railway.json` per service: Dockerfile builder, `watchPatterns`, API `preDeployCommand: node dist/db/migrate.js`, health checks `/v1/health` and `/healthz`, 30 s draining so pg-boss stops cleanly. (3) The API has no public domain. Everything outside Railway, including the post-deploy smoke test, goes through the web origin's `/api` proxy (`/api/v1/health/ready`). (4) CI has two jobs. `verify` runs the gates and Testcontainers suites. `e2e` builds both images with `docker compose --profile full`, migrates from zero with the image's migrate script, and runs Playwright against the containers (`E2E_EXTERNAL_SERVERS=1`). (5) `Staging smoke` runs on GitHub `deployment_status` events from Railway (environment name contains `staging`) or by hand, against the repository variable `STAGING_WEB_URL`. (6) Readiness probes R2 with a `GetObject` on a key that never exists and accepts only `NoSuchKey`. `HeadBucket` may be refused for tokens scoped to "Object Read & Write" on specific buckets, and a HEAD can't tell a missing key from a missing bucket. (7) The compose `full` profile runs the API with `APP_ENV=test`: production build and JSON logs, but no `Secure` cookies over http://localhost. Role passwords and secrets come from `.env`, because migrations reset role passwords on every run. (8) A staging build shows a "Staging environment — test data only" ribbon (`NEXT_PUBLIC_APP_ENV`).

## Why

Testing the exact images Railway runs catches Dockerfile, standalone-output and native-module (`sharp`) problems before deploy. A public API domain would be one more surface to secure and isn't needed until webhooks (v1.1). Railway build cache mounts need service-specific IDs, which would make the Dockerfiles non-portable, so the dependency layer is cached by layer order instead.

## Consequences

- The db-backup cron service, production environment and custom domains are step 6.2.
- Rate limiting relies on Railway's edge appending the client IP to `X-Forwarded-For`, read through the API's private-network-only `trust proxy`. Verify on staging (docs/deployment/railway.md troubleshooting).
- `pnpm test:e2e` still runs against host builds locally. CI runs it against the images.
