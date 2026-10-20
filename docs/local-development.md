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
pnpm dev                          # web http://localhost:3000 · api http://localhost:4000
```

From step 1.2 onward, also run `pnpm db:migrate` (and from 1.3 `pnpm db:seed`) before `pnpm dev`.

## What runs where

| Service                       | URL                                                                          | Credentials                                                   |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Web (Next.js)                 | http://localhost:3000 · liveness `/healthz`                                  | —                                                             |
| API (NestJS)                  | http://localhost:4000 · liveness `/v1/health`                                | —                                                             |
| Postgres 17                   | `localhost:5432`, database `fitcoach`                                        | `postgres` / `postgres` (owner; app roles arrive in step 1.2) |
| Mailpit (email)               | UI http://localhost:8025 · SMTP `localhost:1025`                             | —                                                             |
| RustFS (S3, stands in for R2) | S3 API http://localhost:9000 · console http://localhost:9001/rustfs/console/ | `localaccesskey` / `localsecretkey`                           |

Buckets: `fitcoach-local-private` (no anonymous access; presigned URLs only) and `fitcoach-local-public` (anonymous read, like the R2 custom domain). MinIO is no longer published as a container image, so RustFS replaces it (ADR-0036).

## Everyday commands

| Task                         | Command                                                               |
| ---------------------------- | --------------------------------------------------------------------- |
| Start / stop infra           | `docker compose up -d` · `docker compose down`                        |
| Wipe local data (DB + files) | `docker compose down -v`                                              |
| Typecheck · lint · format    | `pnpm typecheck` · `pnpm lint` · `pnpm format`                        |
| Unit tests                   | `pnpm test`                                                           |
| E2E (desktop + mobile)       | `pnpm test:e2e` (first time: `pnpm exec playwright install chromium`) |
| Phone viewport only          | `pnpm test:e2e --project=mobile`                                      |
| Every gate                   | `pnpm verify`                                                         |

`pnpm test:e2e` reuses a running `pnpm dev`; otherwise it starts the web and API dev servers itself.
Commands for later steps (`db:*`, `test:db`, `test:api`, `api:client`, `platform:grant`, `beta:invite`) exist already and print which step implements them.

## Troubleshooting

- **`failed to connect to the docker API`**: Docker Desktop isn't running. Start it and wait until `docker info` succeeds.
- **Port already in use (3000, 4000, 5432, 8025, 9000, 9001)**: stop the other process, or another FitCoach `pnpm dev` that is still running.
- **`ERR_PNPM_IGNORED_BUILDS`**: a new dependency wants to run an install script. If it's expected (native binaries), add it under `allowBuilds` in `pnpm-workspace.yaml`.
- **Bucket missing after `docker compose down -v`**: run `docker compose up -d` again; `storage-init` recreates both buckets.
- **Line endings on Windows**: `.gitattributes` forces LF. If Prettier reports every file, run `git add --renormalize .` once.
