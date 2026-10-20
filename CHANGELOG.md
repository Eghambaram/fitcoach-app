# Changelog

All notable changes to FitCoach. Entries reference `PROMPT.md` sections and `PHASES.md` steps.

## [Unreleased]

### Added

- Step 1.2 API foundation (PROMPT §4.3, §4.5, §10.1, §10.5, §10.6, §12.1): Zod-validated config (refuses the owner role for request traffic), pino logging with request ids and hashed IPs, helmet, narrow trust proxy, CSRF guard, the error contract filter (Zod, Postgres 23505/23P01/23503/42501, HTTP errors), nestjs-cls, the per-request `DbContextInterceptor` with RLS context, `SystemDb.run(reason, fn)`, `AuditService`, pg-boss lifecycle as `fitcoach_system`, `/v1/health/ready`, OpenAPI at `/v1/docs` (non-production).
- Database: idempotent role bootstrap (`fitcoach_app` NOBYPASSRLS, `fitcoach_system` BYPASSRLS), migration runner (roles → SQL → pg-boss → grants, advisory-locked), `app.current_*()` helpers, `app.set_updated_at()`, `rate_limit_buckets` + `app.check_rate_limit()`, `idempotency_keys`, insert-only `audit_logs`, `pnpm db:migrate` / `db:reset` / `db:generate`, `docs/rls.md`.
- Tests: Testcontainers DB/RLS suite (`pnpm test:db`) incl. the CI gate that fails on any public table without forced RLS; API integration suite (`pnpm test:api`) incl. CSRF, the error contract and a tenant-id tampering case. CI runs both, plus e2e against a migrated Postgres, on every `step/*` push.
- `pnpm api:client` generates `packages/api-client` from the API's OpenAPI document; shared Zod contracts for errors and health. ADR-0038.
- Step 1.1 monorepo (PROMPT §4.1, §18): pnpm workspaces + Turborepo with `apps/web` (Next.js 16, React 19, Tailwind 4, shadcn config, `/healthz`), `apps/api` (NestJS 11, `/v1/health`, listens on `::`), `packages/shared` (INR/paise formatting with Indian grouping, workspace defaults), `packages/api-client` (openapi-fetch wrapper sending `X-FitCoach-Request`), `packages/config` (tsconfig/ESLint/Prettier presets).
- `docker-compose.yml`: Postgres 17, Mailpit, RustFS with private + public-read buckets created by an AWS CLI init job.
- Root scripts from the CLAUDE.md command table (later-step commands print which step implements them), Vitest in every package, Playwright (desktop + mobile, axe check), GitHub Actions CI, `.env.example` files, `docs/local-development.md`.
- ADR-0035 (NestJS 11 / TypeScript 5.9 / ESLint 9 pins), ADR-0036 (RustFS replaces MinIO), ADR-0037 (muted text token darkened for AA contrast).
- Step 0.1 plan: `docs/architecture.md`, ADR-0001–0025 for decisions D1–D25 (`docs/decisions/`), `docs/mvp-plan.md` with the step-to-spec map, risks and open questions.

### Changed

- Phase 2 reordered: conversion (2.4) → onboarding (2.5) → calendar (2.6), so recurring series have real clients (ADR-0028).
- Node 24 LTS replaces Node 22 in the spec and Dockerfile sketch (ADR-0026).
- Local object storage is RustFS instead of MinIO in PROMPT.md, CLAUDE.md and PHASES.md (ADR-0036).
- `--muted-foreground` token `#6C756F` → `#6A736D` (ADR-0037).
- Step 0.1 open questions resolved as ADR-0026–0034 (Postgres 17 locally, `beta:invite` CLI, product events from step 1.3, time-based packages informational, signup business fields, client limit 50, original logo).
