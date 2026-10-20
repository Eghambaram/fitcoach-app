# CLAUDE.md — FitCoach

Operating manual for AI coding agents in this repository.
**Product spec, acceptance criteria and deployment design live in `PROMPT.md`** (MVP Edition) — read it fully before your first change, and re-read the relevant § before each feature. **`PHASES.md`** is the build order (one session per step). **`MVP_REVIEW.md`** explains why the scope is what it is.

---

## What this project is

FitCoach — Personal Trainer Copilot. Mobile-first, multi-tenant SaaS for independent personal trainers (leads → trials → clients → programs → workouts → check-ins → progress), with a simple client portal and a Platform Owner admin.

**Architecture:** Next.js (UI) → same-origin `/api` proxy → **NestJS API** → **PostgreSQL** (+ **Cloudflare R2** object storage, SMTP).
**Environments:** local on **Docker Desktop** (Postgres, Mailpit, RustFS) · staging & production on **Railway** (web, api, Postgres, db-backup cron) + **Cloudflare R2** for files (free tier 10 GB). **No Supabase.**

**Current release: MVP closed beta** — free, invite-only, 5–10 trainers in India.

The non-negotiable spine (protect it if scope is cut):
`enquiry → follow-up → trial → conversion (+ package) → onboarding → program → session/workout log (deducts package) → check-in → progress → sharing`

---

## MVP cut line (read before every task)

- **Build only what PROMPT §1A marks MVP.** Items marked **v1.1** or **Later** stay unbuilt: no routes, no nav items, no tables, no "coming soon" scaffolding.
- **Not in MVP:** subscription billing/Razorpay, plans editor, progress photos, Kanban, calendar month view, availability windows, email/web-push reminders, scoped check-in links, trainer MFA, Google sign-in, support tickets, global search, nutrition, chat/messages page, WhatsApp API, group sessions, analytics, announcements.
- **In MVP and easy to miss:** packages + sessions left + manual payments (§8.3A), recurring session series (§8.6), WhatsApp invite link for clients (§8.3), message templates (§8.12), starter program templates + ~100 seeded exercises (§8.5), first-run checklist (§8.1), feedback button + product events (§16.0, §10.2), CSV export, beta invite codes.
- If an MVP feature seems to need a deferred one, write an ADR and pick the smallest MVP-compatible option.

---

## Stack

pnpm workspaces + Turborepo · **web:** Next.js ≥16 App Router, React 19, Tailwind, shadcn/ui (Radix), Lucide, React Hook Form, TanStack Query, Recharts · **api:** NestJS, nestjs-zod, @nestjs/swagger, nestjs-cls, nestjs-pino, helmet, pg-boss · **db:** PostgreSQL, Drizzle ORM + SQL migrations · **auth:** custom (argon2id, opaque DB sessions, email OTP/magic link, Google via arctic, TOTP via otplib) · **files:** Cloudflare R2 via AWS SDK v3 S3 client (RustFS locally) + sharp · **shared:** Zod schemas in `packages/shared` · **tests:** Vitest, RTL, Supertest, Testcontainers, Playwright, axe.

---

## Commands

> Keep in sync with `package.json`. Add missing scripts rather than working around them.

| Task | Command |
|---|---|
| Start local infra | `docker compose up -d` (Postgres :5432, Mailpit :8025, RustFS :9000/:9001) |
| Stop / wipe infra | `docker compose down` · `docker compose down -v` (deletes local data) |
| Install | `pnpm install` |
| Migrate (roles + SQL + pg-boss) | `pnpm db:migrate` |
| New migration from schema diff | `pnpm db:generate --name <name>` → then hand-edit SQL (RLS, constraints) |
| Seed demo data (dev only) | `pnpm db:seed` |
| Reset local DB | `pnpm db:reset` |
| Dev (web :3000, api :4000) | `pnpm dev` |
| Regenerate API client | `pnpm api:client` (OpenAPI → `packages/api-client`) |
| Typecheck / lint / format | `pnpm typecheck` · `pnpm lint` · `pnpm format` |
| Unit tests | `pnpm test` |
| DB/RLS + API integration (needs Docker) | `pnpm test:db` · `pnpm test:api` |
| E2E | `pnpm test:e2e` (`--project=mobile` for phone viewport) |
| Production-parity stack | `docker compose --profile full up --build` |
| Grant platform owner | `pnpm platform:grant <email>` |
| All gates | `pnpm verify` |

After any API contract change: `pnpm api:client`, commit the generated client. After any migration: run `pnpm test:db`.

---

## Repository map

```
apps/web/        Next.js — app/(public) app/app app/client app/platform, app/api/[...path] (proxy),
                 components/, features/<domain>/ (UI only), lib/api/{server,browser}.ts, lib/env.ts, proxy.ts
apps/api/        NestJS — src/main.ts, src/common/ (guards, decorators, interceptors, filters, cls),
                 src/db/ (client.ts, system-db.ts, schema/, migrations/, migrate.ts, seed/),
                 src/modules/<domain>/ (controller, service, repository, dto), src/integrations/
packages/shared/      Zod schemas, enums, metric definitions, unit conversion (used by web AND api)
packages/api-client/  generated OpenAPI types + fetch wrapper
packages/config/      tsconfig/eslint/prettier presets
infra/db-backup/      cron image + railway.json
docs/design/          reference boards (PNG) + README.md screen index — visual direction only
docs/source/          original briefs (superseded by PROMPT.md; history only)
docker-compose.yml · .env.example · docs/
```
Adapt to existing conventions if the repo differs — don't create parallel structures.

---

## Non-negotiable rules

### Authorization & data
1. **Tenant identity comes from the session only.** Never trust `workspace_id`/`client_id` from body, query or params for authorization.
2. **Every controller is guarded** (`SessionGuard` → `RolesGuard` → `WorkspaceGuard`/`ClientScopeGuard`; `PlatformMfaGuard` for `/platform`). Public endpoints are explicitly marked `@Public()` and rate-limited.
3. **Request DB access goes through the CLS transaction** with `set_config('app.*', …, true)` context and the **`fitcoach_app` role (no BYPASSRLS)**. Repositories still filter by `workspace_id` explicitly — RLS is the safety net, not the only check.
4. **`fitcoach_system` (BYPASSRLS) only via `SystemDb.run(reason, fn)`** — for jobs, webhooks, pre-session auth lookups, public enquiry insert, platform aggregates. Each use is justified in code and audited where it changes data.
5. **New table ⇒ same migration:** `workspace_id` (if tenant-owned), indexes, `ENABLE` + `FORCE ROW LEVEL SECURITY`, policies, grants, and RLS tests. CI fails on any table without RLS (except the reference allow-list).
6. Child tables carry `workspace_id` with composite FKs `(workspace_id, parent_id)`.
7. **Clients** see only own rows, enabled features and `progress_shares`-shared progress, via client-portal endpoints/views — never trainer notes, leads, metrics or settings.
8. **Platform owners** see aggregates, not tenant PII; exceptional access only through time-boxed, audited `support_access_grants`. MFA (AAL2) required.

### Auth & web security
9. Sessions are opaque random tokens in an `httpOnly; Secure; SameSite=Lax` cookie (`fc_session`), stored hashed. Revoke on logout, password change, archive, suspension.
10. The browser only talks to the **web origin**; `/api/*` is proxied to the API over the private network. Never call the API's public domain from the browser.
11. State-changing API requests require matching `Origin` (`WEB_ORIGIN`) and header `X-FitCoach-Request: 1`.
12. All tokens (invite, OTP, reset, magic link, check-in link): random, hashed, expiring, single-use/revocable. argon2id for passwords. Constant-time, non-enumerating auth responses.
13. No secrets in `NEXT_PUBLIC_*`. Never log tokens, emails, phones, health data or raw IPs (hash with `IP_HASH_SALT`).

### Data integrity
14. Multi-record operations = **one transaction in the service** with row locks where races matter (conversion, onboarding finalize, assignment, workout completion, invite accept, billing events).
15. Critical mutations honour `Idempotency-Key`; workout sets use client-generated UUIDs (idempotent upsert).
16. Measurements/history are **append-only** (void + insert, never overwrite).
17. Appointment overlaps blocked by the **exclusion constraint**; map `23P01` → friendly conflict error.
18. A lead becomes `converted` only inside the conversion transaction after the client exists.
19. Store `timestamptz` + IANA timezone; "today/overdue/streak" use the **workspace timezone** (servers run UTC). Canonical units kg/cm.

### Packages & WhatsApp (MVP core)
20a. Money is integer **paise** (`bigint`); display INR with Indian grouping (₹1,23,456). No floats.
20b. Session deduction happens **only** in the attendance transaction via `package_session_ledger` (unique per package + appointment). Un-marking writes a reversal row — never delete or update ledger or payment rows.
20c. Clients see sessions left and expiry only — never prices, amounts due or payment records.
20d. WhatsApp = click-to-chat only: render the workspace's `message_templates` with known placeholders, URL-encode, open `https://wa.me/<E164>?text=…`. Log a `communication_logs` row only when the trainer confirms "Sent" — never claim a message was delivered.
20e. Client invite links: single-use, hashed, 7-day expiry, revocable; accepting creates a 60-day session. Email OTP is the re-login fallback. No SMS.

### Honesty in the product
20. **No hardcoded/sample numbers, fake success, fake chat, fake "reminder sent", fake health status, invented reviews, third-party brand logos or "trusted by" claims.** Unconfigured integrations show "Not configured".
21. No medical diagnoses or predictive scores; check-ins labelled "self-reported"; estimates (e1RM, MRR) labelled as estimates.
22. Nothing in navigation that doesn't work — hide it or disable it with "Coming soon".

### Code quality
23. TypeScript strict, no `any` (use `unknown` + Zod). **One Zod schema per contract in `packages/shared`**, used by the web form and the API DTO.
24. Business logic lives in API services — not in controllers, not in React. Web `features/` holds UI and hooks only.
25. Web: Server Components for reads (via `lib/api/server.ts`, cookie forwarded); client components + TanStack Query for mutations via `/api`. **No Server Actions for business data.** No API calls during `next build`.
26. API error contract: status + `{ code, message, fieldErrors?, requestId }`. Web maps it to field errors/toasts.
27. Every page: loading, empty, error, permission-denied states; mobile + desktop.
28. Optimistic UI only with rollback. Accessibility: labels, focus, keyboard alternatives, no colour-only status, reduced motion.

---

## Design system quick reference

Tokens: `charcoal #18211D` · `lime #C8F169` (hover `#A9D846`, text on lime = charcoal) · `background #F6F7F3` · `card #FFFFFF` · `foreground #18201C` · `muted #6A736D` · `border #E6EAE5` · semantic success/warning/danger/info + soft variants. Lime only for primary actions, active nav, positive indicators.
Radius card 16 / control 12 / pill full · Inter · 4px scale · touch targets ≥ 44px.
Desktop: charcoal sidebar + compact top bar + right drawers. Mobile bottom nav — Trainer: Home/Leads/Clients/Calendar/More · Client: Home/Workouts/Progress/Check-in/More.
Reuse shared components (PROMPT §7.2). Change tokens, not ad-hoc styles.
**Reference boards:** `docs/design/*.png`. Before building any screen, read `docs/design/README.md`. It gives each screen's status (Build / Adjust / v1.1 / Later), the MVP changes and the matching PROMPT section. Match layout and feel, not content: the people, names, numbers and photos on the boards are placeholders and must never be reused.

---

## Database workflow

1. Edit Drizzle schema in `apps/api/src/db/schema/` → `pnpm db:generate --name <name>`.
2. Hand-edit the generated SQL: constraints (CHECK, exclusion, composite FKs), triggers, `ENABLE/FORCE ROW LEVEL SECURITY`, policies using `app.current_*()` helpers, grants for `fitcoach_app`/`fitcoach_system`.
3. **Expand → migrate → contract.** Each migration must work with the API version currently running on Railway. Never edit an applied migration.
4. `pnpm db:migrate` → `pnpm test:db` (add cross-tenant, client-scope and empty-context tests for the new table).
5. Update `docs/rls.md`. Dev data → `seed/`; production reference data → migrations.

---

## Railway specifics

- Services per environment: **web**, **api**, **Postgres**, **db-backup** (cron). Separate staging and production environments; PR environments get their own Postgres and use staging R2 under a `pr-<n>/` key prefix.
- Monorepo Docker builds from repo root with `turbo prune`; per-service config files (`apps/web/railway.json`, `apps/api/railway.json`, `infra/db-backup/railway.json`) with `watchPatterns`.
- **Listen on `::`** (API `app.listen(port, '::')`, web `HOSTNAME=::`) or private networking fails. Private networking isn't available during builds.
- **Migrations run when the API container starts** (image CMD: `node dist/db/migrate.js && exec node dist/main.js`, owner URL, advisory-locked). A failed migration exits the container, so the deploy never goes healthy and the old one keeps serving (ADR-0043). Railway may ignore `railway.json`: services set `RAILWAY_DOCKERFILE_PATH` and must not override the start command.
- `NEXT_PUBLIC_*` are build-time (`ARG` in the web Dockerfile) — changing them needs a rebuild.
- Web reaches the API at `API_INTERNAL_URL` (`http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`); set the API `PORT` explicitly.
- Postgres: enable scheduled volume backups (+ PITR on production if available) **and** keep the nightly `pg_dump` to the private R2 bucket (off-platform; wiping a Railway volume deletes its volume backups).
- App Sleeping off for web/api in production (pg-boss schedules run in the API).
- Health: API `/v1/health` (deploy check, no DB), `/v1/health/ready` (DB + pg-boss + R2); web `/healthz`.
- Full guide, variables and troubleshooting: PROMPT §17; local setup: PROMPT §18.

---

## Cloudflare R2 (file storage, free tier)

- Free tier is **per Cloudflare account**, shared by staging + production: 10 GB-month storage, 1M Class A (writes/lists), 10M Class B (reads), free egress. Overage is billed — the app enforces its own budget.
- **Two buckets per environment:** `fitcoach-<env>-private` (progress photos, avatars, exports, DB backups — presigned GET ≤ 5 min after an auth check, `r2.dev` disabled) and `fitcoach-<env>-public` (public-page photos, global exercise media — served from custom domain `media.<domain>` via Cloudflare CDN; `r2.dev` only for local/staging testing, it's rate-limited).
- All uploads go **through the API**: type/size check → `sharp` strips EXIF → WebP (max 1600 px) + 400 px thumbnail → write a `files` row. Never store originals. Object keys are immutable UUIDs (no cache purges).
- `files.size_bytes` is the storage ledger. Check `StorageService.usage()` before every upload: ≥ `STORAGE_BUDGET_BYTES` (8 GiB) → Platform Health "Degraded" + owner notification; ≥ `STORAGE_HARD_LIMIT_BYTES` (9 GiB) → refuse with a clear message. Plan entitlement `max_progress_photos_per_client` also applies.
- Deletes are soft (`files.deleted_at`) and purged by a job after 7 days — R2 has no versioning to undo mistakes.
- S3 client config for R2: `endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `region "auto"`, `requestChecksumCalculation` and `responseChecksumValidation` = `"WHEN_REQUIRED"`.
- One R2 API token per environment, scoped to that environment's buckets. Lifecycle rules: `exports/` 1 day, `backups/daily/` 8 days, `backups/weekly/` 35 days, abort incomplete multipart uploads after 1 day.
- Locally, RustFS mimics both buckets (public one has anonymous read). Same code path — only env values change.
- Full setup and budget rules: PROMPT §17.7.

---

## How to work (per vertical slice)

1. Re-read the PROMPT § for the feature; check `docs/decisions/`.
2. Zod contract in `packages/shared`.
3. Migration (schema + constraints + RLS + grants) + DB tests.
4. API module: repository → service (transactions, rules) → controller (guards, DTOs, OpenAPI) → integration tests incl. a tampering case.
5. `pnpm api:client`.
6. Web: server-component page + client components; all states; mobile + desktop.
7. Playwright for the user path.
8. `pnpm verify`; fix everything.
9. Update docs/ADR/`CHANGELOG.md`; commit `feat(leads): conversion transaction (PROMPT §8.2)`.

Phase order (PROMPT §20, prompts in `PHASES.md`): 0 Plan → 1 Foundation (+ first Railway staging deploy) → 2 Growth spine → 3 Coaching & packages → 4 Client app & results → 5 Dashboard & beta readiness → 6 Platform & production.
Don't stop after planning. Don't ask approval for reasonable decisions — record an ADR. Ask only for irreversible, genuinely ambiguous choices.

---

## Definition of done for any task

- [ ] In MVP scope (PROMPT §1A); nothing v1.1/Later scaffolded
- [ ] Works end-to-end with real data; no hardcoded values or fake success
- [ ] API guard + RLS policy + tests proving other tenants/clients can't access it
- [ ] Shared Zod schema used on both sides; field-level errors
- [ ] Loading / empty / error / permission-denied states; mobile + desktop; keyboard accessible
- [ ] `pnpm verify` passes; migrations apply from zero; API client regenerated
- [ ] Runs in `docker compose --profile full`; deployable on Railway + R2 (new env vars added to `.env.example`, config validation and PROMPT §17.3)
- [ ] Docs/ADR/CHANGELOG updated

---

## Gotchas

- Next 16: `proxy.ts` (not `middleware.ts`), Node runtime; `cookies()`/`headers()` are async. `proxy.ts` only checks cookie presence — real auth is `GET /v1/auth/me`.
- The `/api/[...path]` proxy must stream the body, forward cookies/`x-request-id`/client IP, and pass `Set-Cookie` back untouched; never cache it.
- `SET LOCAL`/`set_config(..., true)` only lasts for the transaction — always run request queries inside the CLS transaction, or RLS returns nothing.
- Keep `DB_POOL_MAX × replicas` well below Postgres `max_connections` (pg-boss uses its own pool too).
- Nest webhooks need `rawBody: true`; verify before parsing.
- `sharp` strips EXIF — always re-encode uploaded photos; never store originals.
- Newer AWS SDK v3 versions send checksum headers by default; with R2 set checksum options to `"WHEN_REQUIRED"` or uploads may fail.
- Never render private R2 images through `next/image` optimization (it would cache them on the server) — use `unoptimized`.
- Recharts is client-only; pass serialized data from server components.
- Locally cookies aren't `Secure` (`APP_ENV=development`); on Railway they must be.
- Phone numbers → E.164 with the workspace default country (IN) before duplicate checks; `wa.me` needs the number **without** `+` or spaces.
- WhatsApp message text must be `encodeURIComponent`-encoded; keep templates short (very long `wa.me` URLs can fail on some phones).
- Recurring series: expand to concrete rows inside one transaction and report conflicts per occurrence instead of failing the whole series silently.
- Attendance marking and package deduction must share one transaction; test double-submit.
- pg-boss handlers must be idempotent; on `SIGTERM` stop gracefully so Railway redeploys don't drop jobs.
