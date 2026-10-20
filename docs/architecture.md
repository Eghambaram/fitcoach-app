# FitCoach — Architecture (MVP closed beta)

> Target architecture for the MVP. Product behaviour and acceptance criteria live in `PROMPT.md`; working rules in `CLAUDE.md`; decisions in `docs/decisions/`. Section references (§) point to `PROMPT.md`.
> Status: **planned** — no application code exists yet (written in step 0.1). Update this file as each phase lands.

---

## 1. System overview

```
                         ┌──────────────────────── Railway project "fitcoach" (per environment) ───────────────────────┐
                         │                                                                                             │
Browser (phone/desktop) ─┼─HTTPS─▶  web  (Next.js ≥16, standalone, HOSTNAME=::)                                         │
  · PWA shell            │           ├─ Server Components ──fetch, fc_session forwarded──┐                             │
  · only ever talks to   │           └─ /api/[...path] streaming proxy ──────────────────┤  private network            │
    the web origin       │                                                               ▼  (API_INTERNAL_URL)         │
                         │          api  (NestJS, listens on '::' and $PORT)                                           │
                         │           ├─ guards → controllers → services → repositories                                 │
                         │           ├─ CLS transaction with set_config('app.*', …, true)                              │
                         │           └─ pg-boss workers + schedules (in-process)                                       │
                         │                 │ fitcoach_app (NOBYPASSRLS)   │ fitcoach_system (BYPASSRLS, SystemDb.run)  │
                         │                 ▼                              ▼                                            │
                         │          Postgres (Railway service, volume backups)  ◀── db-backup (cron, pg_dump -Fc)      │
                         └─────────────────────────────────────────────────────────────────────────┬───────────────────┘
                                                                                                    │ S3 API
api ──S3 API──▶ Cloudflare R2  fitcoach-<env>-private  (presigned GET ≤ 5 min)                      │
                               fitcoach-<env>-public   ◀── media.<domain> (Cloudflare CDN) ◀── Browser (public images)
api ──SMTP / Resend──▶ auth emails only (verify, reset, client OTP, invite fallback)
```

Locally the same topology runs on Docker Desktop: Postgres, Mailpit (SMTP + UI) and MinIO (both buckets) in `docker-compose.yml`; `pnpm dev` runs web on :3000 and api on :4000 (`API_INTERNAL_URL=http://localhost:4000`). Profile `full` also builds the production Dockerfiles for parity checks (§18).

Key properties:
- **Same-origin API** (ADR-0008). The browser never calls the API domain; first-party cookies, no CORS. In the MVP the API needs **no public domain at all** — health checks for smoke tests go through the web proxy (`/api/v1/health/ready`) and the backup heartbeat travels over the private network. Billing webhooks (v1.1) are the first thing that will need one.
- **Stateless replicas.** Sessions, rate limits, idempotency keys and jobs live in Postgres; files in R2; nothing on container disks. No Redis (ADR-0010).
- **One mutation path.** Every write goes browser → `/api` proxy → API service → Postgres. No Server Actions for business data (ADR-0009).

---

## 2. Monorepo

pnpm workspaces + Turborepo (ADR-0003).

```
apps/web               Next.js App Router — UI only
  app/(public)/        /, /pricing, /beta, /login, /signup, /forgot-password, /reset-password,
                       /verify-email, /coach/[slug], /privacy, /terms, /invite/[token]
  app/app/             trainer workspace  (/app/*)
  app/client/          client portal      (/client/*)
  app/platform/        platform owner     (/platform/*)
  app/api/[...path]/   same-origin streaming proxy → API
  app/healthz/         web liveness
  components/ui|shell  shadcn primitives + AppShell, BottomNav, PageHeader … (§7.2)
  features/<domain>/   UI components + hooks per domain (no business rules)
  lib/api/             server.ts (RSC client, cookie forwarded) · browser.ts · errors.ts
  lib/env.ts           Zod-validated env; refuses secrets under NEXT_PUBLIC_*
  proxy.ts             coarse redirect only: no fc_session cookie → right login page
apps/api               NestJS — all business logic
  src/main.ts          helmet, pino, narrow trust proxy, listen('::', PORT)
  src/common/          guards, decorators (@Public, @Roles), DbContext interceptor, error filter, cls
  src/db/              client.ts (app pool) · system-db.ts · schema/*.ts · migrations/*.sql · migrate.ts · seed/
  src/modules/<domain> controller · service · repository · dto
  src/integrations/    email/ storage/ captcha/ whatsapp/ monitoring/   (billing/ is v1.1)
packages/shared        Zod schemas (one per contract), enums, metrics.ts, unit conversion, phone helpers
packages/api-client    openapi-typescript types + openapi-fetch wrapper (generated by `pnpm api:client`)
packages/config        tsconfig / eslint / prettier presets
infra/db-backup        cron image (postgresql-client + Node upload script) + railway.json
```

Contract flow: Zod schema in `packages/shared` → used by the React Hook Form resolver **and** the `nestjs-zod` DTO → `@nestjs/swagger` emits OpenAPI → `pnpm api:client` regenerates `packages/api-client` → web consumes typed calls.

---

## 3. Request lifecycle (API)

```
HTTP → helmet / pino(request_id) → CSRF check (state-changing: Origin == WEB_ORIGIN && X-FitCoach-Request: 1)
     → SessionGuard      fc_session cookie → sha256 → sessions row → user, aal, actor     (@Public() skips)
     → RolesGuard        @Roles('trainer' | 'client' | 'platform_owner')
     → WorkspaceGuard    trainer's workspace from session; suspended ⇒ read-only           (trainer routes)
       ClientScopeGuard  client_id from session + per-client feature flags                 (client-portal routes)
       PlatformMfaGuard  aal2 required                                                     (/platform routes)
     → DbContext interceptor
         BEGIN;  select set_config('app.user_id',…,true), set_config('app.workspace_id',…,true),
                        set_config('app.client_id',…,true), set_config('app.actor',…,true);
         tx handle stored in CLS
     → controller (Zod DTO) → service (rules, row locks, idempotency) → repository (always WHERE workspace_id = …)
     → COMMIT / ROLLBACK → error filter maps to { code, message, fieldErrors?, requestId }
```

Errors: `23505` → duplicate, `23P01` → `CONFLICT_APPOINTMENT` ("You already have … at …"), `23503` → not found/invalid reference, domain codes `PLAN_LIMIT`, `WORKSPACE_READ_ONLY`. No SQL or stack traces leave the API.

Idempotency: critical mutations (conversion, onboarding finalize, attendance, invite accept, payments, series creation) accept `Idempotency-Key`; stored in `idempotency_keys` and replayed. Workout sets use client-generated UUIDs (`PUT /workout-sets/:clientUuid`).

---

## 4. Data & tenancy

### 4.1 Identity model (§4.4)
- `users` (citext email) → `profiles` (`kind: trainer | client`) → `workspaces` (one per trainer, `workspace_members.role = 'owner'`, ADR-0005).
- `clients.user_id` is NULL until the client accepts an invite link.
- `platform_roles` grants `platform_owner` — only via `pnpm platform:grant <email>` (audited).
- `sessions.id = sha256(token)`; trainers 30-day sliding, clients 60-day sliding, platform owners 12 h absolute + AAL2.

### 4.2 Postgres roles (ADR-0006)
| Role | BYPASSRLS | Used by |
|---|---|---|
| owner (`postgres` on Railway) | n/a | `migrate.js` only (preDeployCommand / `pnpm db:migrate`) |
| `fitcoach_app` | **no** | every request-scoped query (inside the CLS transaction) |
| `fitcoach_system` | yes | `SystemDb.run(reason, fn)` only: pre-session auth lookups, public enquiry insert, pg-boss jobs, platform aggregates, audited admin actions |

### 4.3 RLS (§10.5)
- Every tenant table: `workspace_id`, `ENABLE` + `FORCE ROW LEVEL SECURITY`, policies, grants — in the **same migration** that creates the table. Child tables carry `workspace_id` and composite FKs `(workspace_id, parent_id)`.
- Helpers `app.current_user_id()`, `app.current_workspace_id()`, `app.current_client_id()`, `app.current_actor()` read `current_setting('app.*', true)`; empty context ⇒ NULL ⇒ no rows.
- Trainer policy: `workspace_id = app.current_workspace_id() AND app.current_actor() = 'trainer'` (+ workspace writable for writes).
- Client policy: `client_id = app.current_client_id() AND app.current_actor() = 'client'` + feature-flag / `progress_shares` checks; column restrictions via `client_portal_*` views (no notes, prices or payments).
- CI test fails if any `public` table lacks RLS (allow-list: global reference tables such as `subscription_plans`, `measurement_types` global rows, global `exercises` / template `programs` handled by `workspace_id IS NULL` read policies).
- Documented per table in `docs/rls.md` (created in step 1.2).

### 4.4 Integrity in the database (§10.3)
Appointment overlap exclusion constraint (gist on `tstzrange`), `num_nonnulls(client_id, lead_id) = 1`, check-in uniqueness per local date, `clients(workspace_id, source_lead_id)` unique, one active package per client (partial unique), ledger unique `(package_id, appointment_id)` for non-reversal rows, append-only ledger/payments/measurements/audit (no UPDATE/DELETE grants), money as `bigint` paise, active-client limit trigger from `workspace_plans`.

### 4.5 Time and units
All instants are `timestamptz`; each workspace stores an IANA timezone (default `Asia/Kolkata`). "Today", "overdue", streaks and job schedules ("07:00 workspace time") are computed in the workspace timezone with date-fns-tz; servers run UTC. Canonical units kg/cm, converted for display (ADR-0016).

---

## 5. Integrations (boundary + local adapter for each, §11)

| Boundary | MVP prod adapter | Local / dev | Not configured |
|---|---|---|---|
| `StorageService` (put, presignGet, publicUrl, delete, usage) | Cloudflare R2, private + public bucket | MinIO (both buckets) | uploads disabled with notice |
| `EmailProvider` | SMTP or Resend | Mailpit SMTP / `console` → `email_outbox` (non-prod only) | Platform Health "Degraded" |
| `CaptchaVerifier` | Cloudflare Turnstile (optional) | always-pass (non-prod) | honeypot + timing + rate limit still apply |
| `WhatsAppLinkBuilder` | click-to-chat `wa.me` | same | — |
| `Monitor` | Sentry (optional) | pino logs | "Not configured" |

Uploads always go through the API: type/size check → `sharp` (EXIF strip, WebP ≤ 1600 px + 400 px thumb) → `files` row (the storage ledger) → budget checks (8 GiB soft / 9 GiB hard). Soft delete + 7-day purge job. S3 client uses `region "auto"` and checksum options `WHEN_REQUIRED` for R2.

Not built in the MVP: `BillingProvider` (Razorpay), `OAuthProvider` (Google), Meta Lead Ads, WhatsApp Business API.

---

## 6. Background jobs (pg-boss, §13)

Runs inside each API replica (`SKIP LOCKED`, distributed `boss.schedule()`), handlers idempotent with dedupe keys, graceful `boss.stop({ graceful: true })` on SIGTERM. MVP jobs: follow-up due/overdue (5 min), trials in 2 h (5 min), unmarked appointments (hourly), package expiry / low sessions / payment due (daily 07:00 workspace time), planned workout window extension (daily), token/OTP/rate-limit/idempotency/session purges (hourly), export generation, auth email queue with retries, files purge (daily), storage reconciliation (weekly). Outcomes feed Platform Health.

---

## 7. Module map — API modules ↔ MVP scope (§1A)

| API module (`src/modules/…`) | Owns (tables) | MVP scope it delivers (§) | Web surface | Step |
|---|---|---|---|---|
| `health` | — | `/v1/health`, `/v1/health/ready` (§17.5) | `/healthz` | 1.2 |
| `audit` | `audit_logs` | immutable audit trail (§12.1) | platform audit viewer | 1.2 → 6.1 |
| `auth` | `users`, `sessions`, `auth_tokens`, `mfa_factors`, `mfa_recovery_codes` | trainer signup (beta code) / verify / login / reset / sessions; client invite accept + OTP; platform TOTP (§12.2) | `/signup`, `/login`, `/invite/[token]`, `/client/login`, `/platform/login` | 1.3, 4.1, 6.1 |
| `users` | `profiles` | profile basics | settings | 1.3 |
| `workspaces` | `workspaces`, `workspace_members`, `trainer_settings`, `workspace_plans` | tenant, settings, plan limit (§8.12) | `/app/settings/*` | 1.3, 2.1 |
| `files` | `files` | uploads + storage ledger (D11, §17.7) | photo pickers | 1.5 |
| `public-pages` | `trainer_public_pages`, `lead_forms` | `/coach/[slug]`, share + QR (§8.2) | public page, share screen | 2.1 |
| `message-templates` | `message_templates` | WhatsApp templates + placeholders (§8.12, D20) | settings section | 1.3 (defaults), 2.1, 2.3 |
| `leads` | `leads`, `lead_activities`, `lead_follow_ups`, `lead_consents` | enquiry intake, list, drawer, duplicates, follow-ups, conversion (§8.2) | `/app/leads`, `/app/leads/[id]` | 2.1–2.4 |
| `communications` | `communication_logs` | log contact, last_contact_at (§8.10) | drawers | 2.3 |
| `calendar` | `appointments`, `appointment_series`, `appointment_changes` | day/week/agenda, series, trials, attendance (§8.6) | `/app/calendar` | 2.6 |
| `clients` | `clients`, `client_goals`, `client_consents`, `client_notes` | list/detail, lifecycle, invite, feature flags (§8.3) | `/app/clients`, `/app/clients/[id]` | 2.4, 3.1, 4.1 |
| `onboarding` | `client_onboarding_drafts` | 4-step wizard with drafts (§8.4) | `/app/clients/new` | 2.5 |
| `packages` | `package_presets`, `client_packages`, `package_session_ledger`, `client_payments` | packages, sessions left, manual payments (§8.3A, D18, D25) | client Packages tab, sheets | 1.3 (presets), 3.2 |
| `exercises` | `exercises` | ~100 seeded + custom (§8.5, D21) | `/app/exercises` | 3.3 |
| `programs` | `programs`, `program_workouts`, `program_exercises`, `client_program_assignments` | starter templates, builder, assignment (§8.5) | `/app/programs`, `/app/programs/[id]` | 3.3, 3.4 |
| `workouts` | `workout_sessions`, `workout_session_exercises`, `workout_sets` | live logging, idempotent sets (§8.5, D15) | `/app/workouts`, `/app/workouts/[sessionId]` | 3.5 |
| `check-ins` | `check_ins`, `check_in_revisions` | client form + trainer inbox (§8.7) | `/app/check-ins`, `/client/check-in` | 4.3 |
| `progress` | `measurement_types`, `measurements`, `progress_shares` | measurements, charts, sharing (§8.8) | `/app/progress`, client Progress tab, `/client/progress` | 2.5 (tables), 4.4 |
| `client-portal` | views `client_portal_*` | client-scoped reads/writes (§9) | `/client/*` | 4.1, 4.2 |
| `notifications` | `notifications`, `notification_deliveries`, `email_outbox` | in-app bell, delivery records (§8.10) | bell in shells | 2.1 (table), 5.2 |
| `dashboard` | (read model) `activity_events` | summary, needs-attention, checklist (§8.1) | `/app/dashboard` | 5.1 |
| `jobs` | pg-boss schema | §13 jobs | Platform Health | 1.2 (setup), 5.2 |
| `product-events` | `product_events` | beta metrics (§1A.5) | — | 1.3 (table + first events), each step adds events, 5.3 completes |
| `feedback` | `feedback` | "Send feedback" (§16.0) | More / Settings | 5.3 |
| `exports` | (files in `exports/`) | CSV export zip (§8.12) | settings section | 5.3 (leads CSV in 2.2) |
| `platform` | `platform_roles`, `subscription_plans`, `platform_settings`, `beta_invites` | overview, trainers, approve/assign/suspend, invites, health, audit (§16.0) | `/platform/*` | 1.3 (`platform:grant`, `beta:invite` CLIs), 6.1 |

Supporting tables created early: `rate_limit_buckets`, `idempotency_keys`, `audit_logs` (1.2).

**Explicitly absent in the MVP** (no module, route, nav item or table): billing/subscriptions/invoices, plans editor, support tickets, announcements, analytics, nutrition, messages/chat, progress photos, availability, scoped check-in links, Google sign-in, trainer MFA, global search, deletion automation.

---

## 8. Environments & deployment (§17)

| | Local | Staging (Railway) | Production (Railway) |
|---|---|---|---|
| Web / API | `pnpm dev` or compose `full` profile | auto-deploy from `main` after CI green | tracks `production` branch, GitHub environment approval |
| Postgres | Docker (same major as Railway) | Railway service + volume backups | + PITR if available |
| Files | MinIO `fitcoach-local-{private,public}` | R2 `fitcoach-staging-*` (`r2.dev` OK for public) | R2 `fitcoach-prod-*`, `media.<domain>` |
| Email | Mailpit | SMTP / Resend | SMTP / Resend (`console` forbidden) |
| Migrations | `pnpm db:migrate` | API `preDeployCommand` (`node dist/db/migrate.js`) | same |

Builds: per-app Dockerfiles from the repo root using `turbo prune`; `watchPatterns` per service; `NEXT_PUBLIC_*` as build `ARG`s. Migrations are forward-only and expand → migrate → contract so a Railway rollback is always safe. Backups: Railway volume backups **plus** nightly `pg_dump -Fc` to the private R2 bucket (off-platform) with a heartbeat to the API.

---

## 9. Testing strategy (§19)

| Layer | Tooling | Proves |
|---|---|---|
| Unit | Vitest | Zod schemas, phone normalisation, duplicate matching, metrics, unit/timezone helpers, template rendering, token hashing |
| DB / RLS | Vitest + Testcontainers (real migrations) | cross-tenant isolation, client scope, empty context, every table has RLS, constraints, append-only grants |
| API integration | Nest testing module + Supertest + Testcontainers | auth flows, conversion concurrency + rollback, attendance deducts once, series conflicts, tampering → 403/404 |
| E2E | Playwright (desktop + mobile projects) + axe | §21 trainer, client and platform-owner journeys |

`pnpm verify` runs every gate; CI runs the same on each PR.
