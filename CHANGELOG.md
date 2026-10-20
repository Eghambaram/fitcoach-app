# Changelog

All notable changes to FitCoach. Entries reference `PROMPT.md` sections and `PHASES.md` steps.

## [Unreleased]

### Added

- Step 1.6 deployment (PROMPT §17.1–§17.6): `apps/api/Dockerfile` and `apps/web/Dockerfile` built from the repo root with `turbo prune` (API via `pnpm deploy --prod`; web as Next.js standalone on `HOSTNAME=::`), `.dockerignore`, `apps/api/railway.json` (pre-deploy migrations, `/v1/health`, draining) and `apps/web/railway.json` (`/healthz`), both with `watchPatterns`.
- `docker compose --profile full`: the same images run locally, with a one-shot `api-migrate` service standing in for Railway's pre-deploy command.
- CI split into `verify` (gates + Testcontainers suites) and `e2e` (Playwright against the Docker images, migrated from zero). New `Staging smoke` workflow after each Railway staging deploy (or by hand): web liveness, readiness through `/api`, and `e2e/smoke.spec.ts` against `STAGING_WEB_URL`. Playwright supports `E2E_EXTERNAL_SERVERS=1` and `E2E_BASE_URL`.
- Staging ribbon on every page when `NEXT_PUBLIC_APP_ENV=staging`.
- `docs/deployment/railway.md` (step-by-step staging setup, every §17.3 variable with Railway reference variables, deploy flow, rollback, troubleshooting) and `docs/deployment/r2.md` (buckets, r2.dev, scoped token, lifecycle rules, budget). ADR-0042.

- Step 1.5 file storage (PROMPT D11, §10.2, §17.7): `StorageService` for the private and public buckets (put, presigned GET ≤ 5 min, public URL, delete, usage) with the R2 S3 client settings (`WHEN_REQUIRED` checksums, `STORAGE_KEY_PREFIX` for PR environments). Upload pipeline through the API: 10 MB in-memory limit, format checked from the real bytes, EXIF stripped, WebP + thumbnail, originals never stored.
- `files` table as the storage ledger (RLS, insert-only plus soft delete, bucket/kind CHECKs) and `profiles.avatar_file_id` guarded by a trigger. Budget checks: `507 STORAGE_FULL` near the hard limit, readiness "degraded" at the soft budget, `503 STORAGE_NOT_CONFIGURED` without `STORAGE_*`. Daily `files.purge` pg-boss job removes objects 7 days after soft delete. `JobsService.registerRecurring`.
- `POST`/`DELETE /v1/files/profile-photo`; `GET /v1/auth/me` returns `profile.avatarUrl`. Web: `/app/settings/profile` (upload, replace, remove, field errors) and the photo in the app shell. `pnpm storage:init` creates local/CI buckets.
- Tests: image processing (EXIF/location strip, sizes, sniffed format), files RLS incl. tampering and suspended workspaces, API integration against a RustFS Testcontainer (upload, replace, remove, over-limit, hard limit, CSRF, presign expiry, purge), e2e upload → WebP → remove and readable refusals. CI gains a RustFS service. ADR-0041.
- Step 1.4 web shells (PROMPT §4.2, §6, §7): design tokens as CSS variables + Tailwind theme (all text pairs ≥ 4.5:1), original logo mark, shared components (AppShell with sidebar / top bar / bottom nav / More sheet, PageHeader, KpiCard, DataList table↔cards, FilterBar, StatusPill, Drawer, ConfirmDialog, Stepper, EmptyState, ErrorState, PermissionDenied, NotConfiguredNotice, OfflineBanner, toasts), MVP-only navigation with unbuilt screens shown as “Coming soon”.
- `/api/[...path]` streaming same-origin proxy (cookies, Origin, client IP, request id, every Set-Cookie passed back, never cached), `lib/api/server.ts` (cookie-forwarding Server Component reads), `lib/api/browser.ts`, `lib/env.ts` (refuses secret-looking `NEXT_PUBLIC_*`), `proxy.ts` coarse redirects.
- Pages: `/signup` (Account → Profile → Business, shared Zod schema, API field errors mapped to their step), `/login`, `/forgot-password`, `/reset-password`, `/verify-email` (one-click confirm), `/app/dashboard` (honest empty state), `/app/settings` + `/app/settings/security` (sessions + sign out), `/platform` (refused by the API for non-owners). API: `GET /v1/platform/access`.
- Tests: web unit tests (components, nav, proxy incl. an SSRF case, env, redirects, signup steps) and browser e2e on desktop + mobile (signup → Mailpit → confirm → login → sessions → sign out, MVP nav, /platform refusal, axe on every auth page). ADR-0040.
- Step 1.3 trainer authentication (PROMPT §4.4, §12.2): `POST /v1/auth/signup` (Account → Profile → Business, beta invite code in `SIGNUP_MODE=invite_code`), `verify-email` (+ `resend`), `login`, `logout`, `GET me`, `password/forgot` + `reset`, `GET sessions` + `DELETE sessions/:id`. argon2id passwords, opaque `fc_session` cookie (httpOnly, SameSite=Lax, Secure outside local) stored as an HMAC, sliding 30-day trainer sessions, rotation on login, revocation on logout and reset, non-enumerating responses, Postgres rate limits.
- Guards `SessionGuard` → `RolesGuard` (fails closed without `@Roles`) → `WorkspaceGuard` (suspended = read-only, pending approval / cancelled = account routes only), `@Public()`, `@AllowInactiveWorkspace()`.
- Tables with RLS: `users`, `profiles`, `sessions`, `auth_tokens`, `workspaces`, `workspace_members`, `trainer_settings`, `subscription_plans` (`beta` seeded), `workspace_plans` (limit from `BETA_DEFAULT_CLIENT_LIMIT`, default 50), `message_templates` (7 defaults), `package_presets` (3 defaults, no prices), `platform_roles`, `beta_invites`, `product_events`, `email_outbox`, `notification_deliveries`.
- `EmailProvider` adapters: SMTP (Mailpit locally), Resend, console (non-production). Auth emails for verification, password reset and "account already exists".
- CLIs: `pnpm beta:invite create|list|revoke`, `pnpm platform:grant <email>`, `pnpm db:seed` (dev demo trainer). All audited.
- Product events `trainer_signed_up` and `email_verified` (ADR-0030). Shared contracts for auth, phone normalisation (E.164), slugs, the common-password blocklist and message-template purposes. ADR-0039.
- Tests: DB isolation for every new table, beta-code concurrency, the full auth journey over HTTP incl. enumeration, rate-limit, rotation and session-tampering cases, and an e2e journey through real SMTP (Mailpit). CI gains a Mailpit service.
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

- The API image migrates on start (`migrate.js && exec main.js`) instead of relying on Railway's pre-deploy command, which the staging setup didn't run. `railway.json` loses `preDeployCommand`/`startCommand`, services set `RAILWAY_DOCKERFILE_PATH`, compose drops the `api-migrate` service, and the Railway guide covers the Railpack and `28P01` symptoms (ADR-0043).
- Storage readiness reads a non-existent key (`NoSuchKey` = reachable) instead of `HeadBucket`, which bucket-scoped R2 tokens may refuse. A misspelled bucket now reports "degraded" (ADR-0042).
- The smoke spec checks the API through the web's `/api` proxy, so it also runs against deployed environments.
- Phase 2 reordered: conversion (2.4) → onboarding (2.5) → calendar (2.6), so recurring series have real clients (ADR-0028).
- Node 24 LTS replaces Node 22 in the spec and Dockerfile sketch (ADR-0026).
- Local object storage is RustFS instead of MinIO in PROMPT.md, CLAUDE.md and PHASES.md (ADR-0036).
- `--muted-foreground` token `#6C756F` → `#6A736D` (ADR-0037).
- Step 0.1 open questions resolved as ADR-0026–0034 (Postgres 17 locally, `beta:invite` CLI, product events from step 1.3, time-based packages informational, signup business fields, client limit 50, original logo).
