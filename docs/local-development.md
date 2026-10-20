# Local development

How to run FitCoach on your machine (PROMPT §18). Works on Windows, macOS and Linux.

## Prerequisites

| Tool           | Version                                 | Check           |
| -------------- | --------------------------------------- | --------------- |
| Docker Desktop | running                                 | `docker info`   |
| Node.js        | 24 LTS (`.nvmrc`)                       | `node -v`       |
| pnpm           | 12 (`packageManager` in `package.json`) | `pnpm -v`       |
| Git            | any recent                              | `git --version` |

## First run

```bash
cp .env.example .env              # local values for the compose services
docker compose up -d              # Postgres, Mailpit, RustFS (+ one-shot bucket setup)
pnpm install
pnpm db:migrate                   # creates the DB roles, applies migrations, installs pg-boss
pnpm dev                          # web http://localhost:3000 · api http://localhost:4000
```

Check it: http://localhost:4000/v1/health/ready should report `database` and `jobs` as `ok`. API docs (non-production only): http://localhost:4000/v1/docs.
From step 1.3, also run `pnpm db:seed` for demo data.

## What runs where

| Service                       | URL                                                                          | Credentials                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Web (Next.js)                 | http://localhost:3000 · liveness `/healthz`                                  | —                                                                                                                                     |
| API (NestJS)                  | http://localhost:4000 · liveness `/v1/health`                                | —                                                                                                                                     |
| Postgres 17                   | `localhost:5432`, database `fitcoach`                                        | owner `postgres` / `postgres` (migrations only); the API connects as `fitcoach_app` and `fitcoach_system` (see `.env`, `docs/rls.md`) |
| Mailpit (email)               | UI http://localhost:8025 · SMTP `localhost:1025`                             | —                                                                                                                                     |
| RustFS (S3, stands in for R2) | S3 API http://localhost:9000 · console http://localhost:9001/rustfs/console/ | `localaccesskey` / `localsecretkey`                                                                                                   |

Buckets: `fitcoach-local-private` (no anonymous access; presigned URLs only) and `fitcoach-local-public` (anonymous read, like the R2 custom domain). MinIO is no longer published as a container image, so RustFS replaces it (ADR-0036).

## Everyday commands

| Task                         | Command                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| Start / stop infra           | `docker compose up -d` · `docker compose down`                        |
| Wipe local data (DB + files) | `docker compose down -v`                                              |
| Typecheck · lint · format    | `pnpm typecheck` · `pnpm lint` · `pnpm format`                        |
| Unit tests                   | `pnpm test`                                                           |
| DB/RLS · API integration     | `pnpm test:db` · `pnpm test:api` (Docker must be running)             |
| Migrate · reset local DB     | `pnpm db:migrate` · `pnpm db:reset` (drops and rebuilds `fitcoach`)   |
| New migration from schema    | `pnpm db:generate --name <name>` (then hand-edit, see `docs/rls.md`)  |
| Regenerate typed API client  | `pnpm api:client` (after any API contract change; commit the output)  |
| E2E (desktop + mobile)       | `pnpm test:e2e` (first time: `pnpm exec playwright install chromium`) |
| Phone viewport only          | `pnpm test:e2e --project=mobile`                                      |
| Every gate                   | `pnpm verify`                                                         |

`pnpm test:e2e` reuses a running `pnpm dev`; otherwise it starts the web and API dev servers itself.
`pnpm test:e2e` needs the database migrated, because it checks API readiness. Commands for later steps (`db:seed`, `platform:grant`, `beta:invite`) exist already and print which step implements them.

## Troubleshooting

- **`failed to connect to the docker API`**: Docker Desktop isn't running. Start it and wait until `docker info` succeeds.
- **Port already in use (3000, 4000, 5432, 8025, 9000, 9001)**: stop the other process, or another FitCoach `pnpm dev` that is still running.
- **`ERR_PNPM_IGNORED_BUILDS`**: a new dependency wants to run an install script. If it's expected (native binaries), add it under `allowBuilds` in `pnpm-workspace.yaml`.
- **API refuses to start with `Invalid API configuration`**: a variable in `.env` is missing or wrong. The message names it; compare with `.env.example`.
- **`/v1/health/ready` says `jobs: degraded`**: run `pnpm db:migrate`. The pg-boss schema is installed by migrations, never at API boot.
- **`password authentication failed for user "fitcoach_app"`**: `DB_APP_PASSWORD` and the password inside `DATABASE_URL` differ. Fix `.env`, then run `pnpm db:migrate` to re-apply the role passwords.
- **Bucket missing after `docker compose down -v`**: run `docker compose up -d` again; `storage-init` recreates both buckets.
- **Line endings on Windows**: `.gitattributes` forces LF. If Prettier reports every file, run `git add --renormalize .` once.
