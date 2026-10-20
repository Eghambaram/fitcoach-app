# FitCoach — Personal Trainer Copilot
## Master Product & Build Prompt — MVP Edition (Closed Beta) · Next.js + NestJS + PostgreSQL · Railway · Cloudflare R2

> **How to use this file.** This is the single source of truth for *what* to build and *why*.
> `CLAUDE.md` is the operating manual for *how* to work in this repository.
> Read both before writing code. When this file and the working repository disagree, the repository wins for conventions; this file wins for product behaviour, security rules and acceptance criteria.
> Section numbers are stable — reference them in commits and PRs (e.g. `feat(leads): conversion transaction (§8.2, §10.4)`).
> **Scope rule:** §1A is the MVP cut line. Anything marked **v1.1** or **Later** is kept here only as reference — **do not build it, do not add it to navigation, and do not create its tables** until that release starts. `PHASES.md` gives the build order as ready-to-run prompts; `MVP_REVIEW.md` explains the product decisions.

---

## 0. Mission

Act as an elite product team: a SaaS Product Owner, a top-tier fitness-app UI/UX designer, a senior TypeScript engineer (Next.js + NestJS + PostgreSQL), a multi-tenant database architect experienced with Row-Level Security, and a QA, accessibility and DevOps engineer.

Build **FitCoach — Personal Trainer Copilot**: a production-ready, mobile-first business-management platform for independent personal trainers, with a deliberately simple client experience and a separate Platform Owner (SaaS admin) workspace.

Build the **product**, not a mockup. Every screen that ships is connected to real forms, real persistence, real authorization and real error handling. Make reasonable product decisions without asking for approval; record significant ones in `docs/decisions/` (ADR format, one short file per decision).

**Core promise:** *Spend less time managing your coaching business and more time helping clients get results.*

**The spine that must never break** (protect it above all else if scope is cut):

```
public lead capture → follow-up → trial → client conversion (+ package) → onboarding
→ program assignment → session/workout tracking (deducts package sessions) → check-in
→ progress review → sharing
```

**Beta goal:** prove that 5–10 real independent trainers in India run their week in FitCoach and are still using it after 30 days (success metrics in §1A.5).

---

## 1. Decisions already made (do not re-litigate)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **No Supabase.** Backend = **NestJS** API + **PostgreSQL**. Frontend = **Next.js** (UI only, no direct DB access). | Avoid free-tier pausing/limits; full control of auth, data and jobs. |
| D2 | **Hosting = Railway** for compute and database in staging/production: `web` (Next.js), `api` (NestJS), `Postgres` (Railway database service), `db-backup` (cron). **File storage = Cloudflare R2** (S3-compatible, free tier 10 GB-month). **Local = Docker Desktop** (Postgres, Mailpit, MinIO standing in for R2). | No idle shutdowns; free object storage with zero egress; identical S3/SMTP/Postgres interfaces locally. |
| D3 | **Monorepo** (pnpm workspaces + Turborepo): `apps/web`, `apps/api`, `packages/shared` (Zod schemas, enums, types), `packages/api-client` (generated typed client), `packages/config` (tsconfig/eslint). | Single source of truth for validation and types across web and API. |
| D4 | **ORM = Drizzle** (node-postgres driver) with **SQL migrations** checked into `apps/api/src/db/migrations`. Constraints, RLS policies, triggers and functions are written in SQL migrations. | SQL-first control needed for RLS, exclusion constraints and `SET LOCAL` request context. |
| D5 | **Tenant key = `workspace_id`.** One workspace per trainer in the MVP (`workspace_members.role = 'owner'`). Multi-trainer Studio stays disabled until its membership/permission model is built. | Studio-ready without a later migration. |
| D6 | **Authorization is layered:** NestJS guards (role + ownership) **and** Postgres **RLS** using per-transaction context (`set_config('app.workspace_id', …, true)`). The API connects as a **non-owner role without BYPASSRLS** for all request traffic. | Defence in depth: a missed `WHERE` cannot leak another tenant's data. |
| D7 | **Auth is built in the API:** email + password (argon2id), email OTP / magic link, Google OAuth (optional, boundary), TOTP MFA (required for platform owners). **Opaque, revocable sessions stored in Postgres**, delivered as an `httpOnly` cookie. No JWT sessions. | Revocation on archive/suspension; simple, auditable. |
| D8 | **Same-origin API:** the browser only talks to the `web` domain. `web` proxies `/api/*` to `api` over **Railway private networking**. The API's public domain is used only for payment webhooks and health checks. | First-party cookies, no CORS, smaller attack surface. |
| D9 | **Data flow in the web app:** reads in Server Components through a server-side typed client (forwarding the session cookie over the private network); mutations from client components through the typed client → `/api` proxy, with TanStack Query for cache/invalidation. No Next.js Server Actions for business data. | One mutation path, one validation path (the API). |
| D10 | **Background jobs = pg-boss** (Postgres-backed queue + distributed cron) running inside the API process. **No Redis.** Railway Cron is used only for the `db-backup` service. | Durable, retryable jobs with no extra infrastructure; safe with multiple API replicas. |
| D11 | **Files = Cloudflare R2, two buckets per environment:** a **private** bucket (progress photos, client avatars, exports, backups) served only via short-lived presigned GET URLs, and a **public** bucket (trainer public-page photos, global exercise media, marketing images) served from a **custom domain** on Cloudflare's CDN (`media.<domain>`; `r2.dev` only for local/staging testing). Uploads go **through the API** (size/type checks, EXIF strip, WebP re-encode). An app-level **storage budget** keeps usage inside the free tier (§17.7). | Private by default; cheap CDN delivery for public images; photos never keep location metadata; no surprise bills. |
| D12 | **Subscription payments are v1.1.** The closed beta is **free**; the platform owner assigns plans/trials manually (audited). When billing starts: `BillingProvider` abstraction with a **Razorpay** adapter (INR) and a `manual` adapter; status changes only via verified webhooks or audited platform-owner actions. | Validate value before charging; never trust the browser. |
| D13 | **Email:** `EmailProvider` with `smtp` (Mailpit locally, any SMTP in prod), `resend`, and `console` (writes to `email_outbox`; non-production only). | Auth emails are now our responsibility. |
| D14 | **Messaging MVP = communication log + click-to-chat.** Persisted trainer↔client threads are **Later** (SSE + Postgres `LISTEN/NOTIFY`). No fake chat UI before that. | Spec: no fake real-time chat. |
| D15 | **Offline:** mutations require connectivity. Each workout set saves immediately with a client-generated UUID (idempotent). Unsaved input is kept as a local draft; an offline banner disables save buttons. Offline queue is post-MVP. | No silently dropped writes. |
| D16 | **Defaults:** country `IN`, currency `INR`, timezone `Asia/Kolkata` — all per workspace. Canonical units kg/cm; convert for display. | Target market; consistent maths. |
| D17 | **Next.js ≥16:** request interception in `proxy.ts` (Node runtime) — only for coarse redirects (has session cookie or not). Real authorization happens in the API. | Current framework convention. |
| D18 | **Client packages, sessions remaining and manually recorded payments are core MVP (§8.3A).** No client payment processing — payments are recorded by the trainer (cash/UPI/bank). | Trainers' biggest weekly pain is "who has sessions left / who hasn't paid". |
| D19 | **Client access = WhatsApp-shared one-time login link** (single-use, 7-day expiry) that creates a 60-day session; **email OTP** is the re-login fallback. No SMS. | Email-only OTP is friction for many Indian clients; SMS in India needs DLT registration and costs per message. |
| D20 | **WhatsApp-first communication via click-to-chat message templates** (follow-up, trial confirmation, invite, payment reminder, check-in nudge) with placeholders. No WhatsApp API in MVP. | Zero cost, zero approval process, matches how trainers already work. |
| D21 | **Starter program templates and a seeded exercise library (~100 exercises)** ship as production reference data. | A trainer must be able to build a real program in < 5 minutes. |
| D22 | **No group/batch sessions in MVP** — one client or lead per appointment. Stated as a known limitation in the beta FAQ. | Keeps scheduling and package maths simple; revisit if ≥ 3 beta trainers ask. |
| D23 | **No progress photos in MVP** (v1.1). Photo consent can still be captured in onboarding. | Highest privacy and storage cost; validate demand first. |
| D24 | **English UI at launch, strings kept translatable** (no hard-coded copy inside logic). | Hindi/Tamil etc. later without rewrites. |
| D25 | **No-show / late-cancel rule is a workspace setting:** default *no-show uses a session*, *cancel more than 12 h before does not*, *late cancel uses a session*. | Matches common trainer policy; configurable. |


---

## 1A. MVP scope — the cut line (closed beta)

Priority labels used throughout this file: **MVP** = build now · **v1.1** = right after beta feedback · **Later** = only when trainers ask or paid users need it. If a section has no label it is MVP.

### 1A.1 Trainer app
| MVP | v1.1 | Later |
|---|---|---|
| Signup (3 steps), verify email, login, reset, sessions list | Trainer MFA, Google sign-in | — |
| **First-run checklist** (publish page → add lead/client → assign program → invite client) | — | — |
| Public enquiry page + share link + QR | Self-serve trial booking | Meta Lead Ads |
| Leads list with stage tabs, search/filters, Add Lead, duplicate check, CSV export | **Kanban board**, bulk actions | — |
| Lead drawer (Overview/edit, Activity, Notes) + WhatsApp/Call/Schedule | Files tab | — |
| Follow-ups with in-app reminders | Email reminders | WhatsApp API automation |
| Trial booking, conflict protection, attendance | — | — |
| Lead → client conversion (+ optional package) | — | — |
| Onboarding wizard with drafts | — | — |
| Clients list + detail (Overview, Packages, Workouts, Schedule, Check-ins, Progress, Notes) | — | — |
| **Packages, sessions remaining, manual payments, payment-due alerts** (§8.3A) | Payment receipts (PDF) | Online client payments |
| Calendar day/week + mobile agenda, **recurring session series**, session notes, no-show policy | Month view, availability windows | Group sessions, Google Calendar sync |
| Exercise library (seed ~100 + custom, media by URL) + **starter program templates** | Exercise media upload | Video library |
| Program builder, assignment, live workout logging | Tempo, per-week progression | — |
| Check-in inbox + mark reviewed | — | — |
| Measurements, trend charts, progress sharing | **Progress photos** | — |
| Dashboard, in-app notifications, communication log in drawers | Email notifications to trainer, global search | Messages page / chat |
| Settings: profile, public page, units, timezone, check-in rules, **message templates**, no-show policy, data export, security | Templates page, support tickets | — |
| "Send feedback" button | — | — |
| — | Own subscription billing page | Nutrition module |

### 1A.2 Client app
| MVP | v1.1 | Later |
|---|---|---|
| **WhatsApp invite link login** + email OTP fallback | Scoped check-in link without login, web push reminders | Google sign-in |
| Home (today's workout, next session, **sessions left**, check-in prompt) | — | — |
| My workouts, workout details, log own workout (if enabled) | — | — |
| Daily check-in | — | — |
| Progress (shared metrics only), schedule, limited profile, **Contact trainer** card | — | Nutrition, messages |

### 1A.3 Platform owner
| MVP | v1.1 | Later |
|---|---|---|
| Separate login + mandatory MFA | Plans & entitlements editor | Announcements, analytics page |
| Overview with real counts (trainers, active, clients, activation) — **no revenue cards** | Razorpay subscriptions, invoices, revenue cards | Support access grants |
| Trainer list/detail, suspend/reactivate, **assign plan / extend trial manually** | Support tickets | — |
| Feedback inbox, audit log viewer, health page (DB, jobs, email, R2, storage, backup) | — | — |

### 1A.4 Platform & quality
MVP: Railway staging + production, Postgres backups + nightly dump to R2, RLS + guards + tests, PWA install (manifest + shell), product events, English UI (translatable), legal pages (privacy, terms, beta FAQ with known limitations). v1.1: web push, data-deletion automation (MVP uses a documented manual procedure run by the platform owner, audited). Later: offline mutation queue, multi-trainer Studio.

### 1A.5 Beta success metrics (instrumented via `product_events`, §10.2)
| Metric | Definition | Target |
|---|---|---|
| Activation | Within 7 days of signup: public page published **and** ≥ 3 clients **and** ≥ 1 program assigned | ≥ 60% of beta trainers |
| Weekly active trainer | ≥ 3 sessions or workouts logged in a calendar week | ≥ 50% at week 4 |
| Lead capture used | ≥ 1 public-page enquiry in first 30 days | ≥ 40% |
| Client engagement | Invited clients submitting ≥ 2 check-ins/week | ≥ 30% |
| Retention | Trainer weekly-active at day 30 | ≥ 50% |
| Willingness to pay | Beta trainers who'd pay ₹499+/month (interview) | ≥ 40% → start v1.1 billing |

### 1A.6 Release stages
**Alpha** (you + 1 friendly trainer) → **Closed beta** (5–10 trainers, free, invite-only signup via beta invite codes in `beta_invites` or platform-owner approval, controlled by `SIGNUP_MODE`) → **v1.1 / paid launch**. Exit criteria per stage are in §20.

---

## 2. Product vision & users

FitCoach helps independent personal trainers (≈10–50 clients, in-gym, online and hybrid) to:

1. Capture and convert prospects into paying clients.
2. Onboard clients with goals, preferences and consented baseline data.
3. Plan programs and record exercise performance.
4. Track progress, adherence and attendance.
5. Run in-person, online and hybrid sessions on one calendar.
6. Collect sub-one-minute daily check-ins.
7. See follow-ups, missed sessions and clients needing attention.
8. Share chosen progress with clients.
9. Run the business from a phone.
10. **Know who has sessions left, whose package is expiring and who hasn't paid.**

**Beta user:** an independent trainer in India with 10–40 clients, mixing gym and online sessions, currently using WhatsApp, notes and Excel/Google Sheets. Their top pains: forgotten enquiry follow-ups; tracking sessions and payments; time spent writing workouts; showing clients their progress.

**Users:** **Trainer** (primary, owns a workspace) · **Client** (sees only what the trainer enables and shares) · **Platform Owner** (operates the SaaS, §16; separate role, layout and guards).

**Principles:** trainer-first · mobile-first with a complete desktop · minimal client complexity · fast daily actions · trustworthy numbers · privacy by default · no enterprise bloat · every feature solves a real problem.

---

## 3. Technology stack

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Web | Next.js (current stable, ≥16) App Router, React 19, TypeScript strict |
| UI | Tailwind CSS, shadcn/ui (Radix), Lucide, Inter via `next/font` |
| Forms | React Hook Form + Zod (`@hookform/resolvers`) using schemas from `packages/shared` |
| Client server-state | TanStack Query (mutations, interactive lists) |
| Charts | Recharts |
| API | NestJS (current stable), Express adapter, TypeScript strict |
| API validation | Zod via `nestjs-zod` (same schemas as web) |
| API docs/client | `@nestjs/swagger` → OpenAPI → `openapi-typescript` + `openapi-fetch` in `packages/api-client` |
| Request context | `nestjs-cls` (AsyncLocalStorage) — holds user, workspace, transaction |
| Database | PostgreSQL (match the major version of Railway's Postgres service locally) |
| ORM / migrations | Drizzle ORM + drizzle-kit (generate) + hand-written SQL migrations for RLS/constraints/functions |
| Jobs | pg-boss |
| Auth | Custom: argon2 (`@node-rs/argon2`), opaque sessions, `otplib` (TOTP), `arctic` (Google OAuth) |
| Files | Cloudflare R2 via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`); `sharp` for EXIF strip, resize, WebP |
| Email | nodemailer (SMTP) / Resend SDK |
| Dates / phones / QR | date-fns + date-fns-tz · libphonenumber-js · `qrcode` |
| Logging | `nestjs-pino` (JSON to stdout) with `request_id` |
| Security | `helmet`, rate limiting on Postgres, CSRF checks (§12) |
| PWA | Web manifest + service worker (Serwist or hand-rolled) |
| Testing | Vitest (web + API, API via `unplugin-swc` for decorators), React Testing Library, Supertest, **Testcontainers** (real Postgres in Docker), Playwright, axe |
| Local infra | Docker Desktop + `docker-compose.yml` (Postgres, Mailpit, MinIO) |
| Hosting / CI | Railway · GitHub Actions |

Rules: Server Components by default; client components only for interaction/browser APIs. **Business logic lives in the API** (NestJS services), never in React components. No microservices, Redis or AI infrastructure in the MVP.

---

## 4. Architecture

### 4.1 Monorepo layout

```
apps/
  web/                         Next.js
    app/(public)/              landing, pricing, coach/[slug], auth pages, privacy, terms, invite, c/[token]
    app/app/                   trainer workspace (/app/*)
    app/client/                client portal (/client/*)
    app/platform/              platform owner (/platform/*)
    app/api/[...path]/route.ts same-origin proxy to the API (private network)
    components/ ui/ shell/     shadcn primitives, AppShell, BottomNav, PageHeader…
    features/<domain>/         UI components + hooks per domain (no business rules)
    lib/api/                   server.ts (server-side typed client), browser.ts, errors.ts
    lib/env.ts                 Zod-validated env
    proxy.ts                   coarse redirects only
    Dockerfile · railway.json
  api/                         NestJS
    src/main.ts                listen on '::' and $PORT, helmet, pino, trust proxy
    src/common/                guards, decorators, interceptors, filters, pipes, cls
    src/db/                    drizzle client(s), schema/*.ts, migrations/*.sql, seed/
    src/modules/               auth, users, workspaces, public-pages, leads, clients, onboarding,
                               exercises, programs, workouts, calendar, check-ins, progress,
                               packages, communications, message-templates, notifications, files,
                               platform, feedback, product-events, audit, jobs, health      (MVP)
                               v1.1/Later: billing, subscriptions, support, announcements, nutrition
    src/integrations/          billing/ email/ storage/ captcha/ whatsapp/ monitoring/
    Dockerfile · railway.json
packages/
  shared/                      Zod schemas, enums, constants, unit conversion, metric definitions
  api-client/                  generated OpenAPI types + thin fetch wrapper
  config/                      tsconfig, eslint, prettier presets
docker-compose.yml             local Postgres, Mailpit, MinIO (+ optional full-stack profile)
docs/                          architecture.md, decisions/, rls.md, metrics.md, api.md,
                               deployment/railway.md, local-development.md, runbooks/
```

### 4.2 Request flow

```
Browser ──HTTPS──▶ web (Next.js, public domain)
                    ├─ pages/RSC ──server fetch (cookie forwarded)──▶ api.railway.internal:$PORT
                    └─ /api/* route handler (stream proxy)───────────▶ api.railway.internal:$PORT
Razorpay ──HTTPS──▶ api public domain /webhooks/billing/razorpay (only public API surface besides /health)
api ──▶ Postgres (private network) · Cloudflare R2 (S3 API) · SMTP/Resend
Browser ──▶ media.<domain> (Cloudflare CDN → public R2 bucket)   public images only
Browser ──▶ presigned R2 URL (≤ 5 min)                             private images, after an API auth check
```
- The `web` proxy forwards method, path, query, body (streamed), cookies, `x-request-id` and the client IP (`x-forwarded-for` from Railway's edge) — and passes `Set-Cookie` back unchanged. It adds nothing else and never caches.
- The API trusts `X-Forwarded-*` only from the private network/proxy hop (`app.set('trust proxy', …)` configured narrowly).
- Server-side reads use `API_INTERNAL_URL`; nothing calls the API during `next build` (private networking isn't available at build time) — all data-driven pages are dynamic.

### 4.3 API layering (per module)

`controller` (HTTP, Zod DTOs, OpenAPI) → `service` (business rules, transactions) → `repository` (Drizzle queries; always scoped by `workspace_id`) → Postgres (RLS as the safety net).

- **Guards:** `SessionGuard` (resolve session cookie → user, AAL) → `RolesGuard` (`@Roles('trainer'|'client'|'platform_owner')`) → `WorkspaceGuard` (loads the trainer's workspace, checks status) → `ClientScopeGuard` (client's own `client_id` + feature flags) → `PlatformMfaGuard` (AAL2). Tenant identity **always comes from the session**, never from request bodies or params.
- **DbContext interceptor:** opens a transaction per mutating request (and for reads that need consistency), then runs `select set_config('app.user_id',$1,true), set_config('app.workspace_id',$2,true), set_config('app.client_id',$3,true), set_config('app.actor',$4,true)`; the transaction handle lives in CLS so repositories use it automatically.
- **Error contract:** HTTP status + `{ code, message, fieldErrors?, requestId }`. Map `23505` (unique), `23P01` (exclusion), `23503` (FK) and domain errors (`PLAN_LIMIT`, `WORKSPACE_READ_ONLY`, `CONFLICT_APPOINTMENT`) to friendly messages. Never leak SQL or stack traces.
- **Idempotency:** critical mutations accept `Idempotency-Key` (UUID per user intent) stored in `idempotency_keys (workspace_id, key, endpoint, response_hash)`; replays return the original result.
- **Pagination:** cursor-based, default 25, max 100. Server-side filtering/sorting.

### 4.4 Tenancy & identity model

```
users (email citext unique, password_hash, email_verified_at, status, mfa_enabled)
user_identities (provider 'google', provider_user_id)
sessions (id = sha256(token), user_id, aal, created_at, expires_at, last_seen_at, ip_hash, user_agent, revoked_at)
auth_tokens (purpose: verify_email|reset_password|magic_link|email_otp|client_invite, token_hash, expires_at, consumed_at)
mfa_factors (user_id, secret_encrypted, confirmed_at) · mfa_recovery_codes (hash, used_at)
profiles (user_id, display_name, avatar_file_id, kind: trainer|client)
workspaces (owner_user_id, slug, name, status: trialing|active|past_due|suspended|cancelled, timezone, country, currency)
workspace_members (workspace_id, user_id, role: owner)
clients (workspace_id, user_id NULL until invite accepted, …)
platform_roles (user_id, role: platform_owner, granted_by, granted_at, revoked_at)
```

### 4.5 Database roles

| Role | Attributes | Used by |
|---|---|---|
| `postgres` (Railway default) / `fitcoach_owner` | owns schema | migrations only (`preDeployCommand`) |
| `fitcoach_app` | LOGIN, **NOBYPASSRLS**, DML grants only | all request-scoped API traffic |
| `fitcoach_system` | LOGIN, **BYPASSRLS** | pg-boss job handlers, billing webhooks, platform aggregate queries, auth lookups that precede a session (login, token verification) — each call site wrapped in `SystemDb.run(reason, fn)` which logs/audits |

A bootstrap script (`db:bootstrap-roles`, idempotent) creates/updates these roles using passwords from env, then migrations grant privileges. Default privileges ensure new tables get the right grants.

---

## 5. Roles & access matrix

| Capability | Trainer (own workspace) | Client (self) | Platform Owner | Public |
|---|---|---|---|---|
| Leads, follow-ups, trials, pipeline | CRUD | ✗ | aggregate counts only | create via enquiry form only |
| Clients (profiles) | CRUD/archive | read own permitted fields; edit allow-listed fields | trainer-level counts; no PII by default | ✗ |
| Trainer private notes, assessments | CRUD | ✗ | ✗ | ✗ |
| Programs & assignments | CRUD | read assigned | ✗ | ✗ |
| Workout sessions/sets | CRUD | create/update own (if enabled) | ✗ | ✗ |
| Appointments | CRUD | read own (permitted fields) | ✗ | ✗ |
| Packages & payments | CRUD | read own package summary (name, sessions left, expiry) — no payment records | ✗ | ✗ |
| Check-ins | read, review | create/edit own (edit window) | ✗ | ✗ (scoped token links are v1.1) |
| Measurements & photos | CRUD | read **shared** only; optional self-log if enabled | ✗ | ✗ |
| Nutrition | CRUD (if enabled) | read own (if enabled) | ✗ | ✗ |
| Business metrics, billing | read own | ✗ | platform-wide | ✗ |
| Plans, subscriptions, support admin, audit logs | own subscription + own tickets | ✗ | full (audited) | pricing page reads active plans |

"Hiding a button is not authorization." Every cell is enforced by an API guard **and** RLS.

---

## 6. Application structure & navigation

**Trainer (`/app/*`) — MVP** desktop charcoal sidebar: Dashboard · Leads (badge: overdue + new) · Clients · Calendar · Programs · Workouts · Check-ins · Progress · Settings; profile card pinned at bottom. Packages live inside the client detail and a "Payments due" dashboard group (no separate nav item). **Not shown in MVP:** Nutrition, Messages, Billing, Templates (message templates live in Settings). Mobile bottom nav: **Home · Leads · Clients · Calendar · More** (More: Programs, Workouts, Check-ins, Progress, Settings, Send feedback, Help). Floating primary action per screen.

**Client (`/client/*`) — MVP** bottom nav: **Home · Workouts · Progress · Check-in · More** (Schedule, Contact trainer, Profile, Help, Sign out). Disabled features are not rendered **and** the API refuses them.

**Platform (`/platform/*`) — MVP** layout with "Super Admin" badge: Overview · Trainers · Feedback · System Health · Audit Logs · Settings. (v1.1 adds Subscriptions, Plans & Pricing, Payments & Invoices, Support Tickets; Later adds Analytics, Announcements.)

**Public** — Landing `/`, Pricing `/pricing` (MVP: "Free during beta" + request-access form; plan cards hidden), Signup/Login (beta invite code or approval), Trainer enquiry page `/coach/[slug]`, Privacy, Terms, Beta FAQ `/beta`.

---

## 7. Design system

The reference boards in **`docs/design/`** are the **visual direction**. Match their layout, density, hierarchy and component language. **`docs/design/README.md`** indexes every screen on them with a status (Build / Adjust / v1.1 / Later), the MVP changes, the PROMPT section and the `PHASES.md` step. Open the relevant board before building any screen.

| Board | Contents |
|---|---|
| `docs/design/01-public-site-and-platform-admin.png` | Landing, platform owner dashboard, pricing, trainer signup, public enquiry page, subscription management |
| `docs/design/02-trainer-dashboard-and-clients.png` | Trainer dashboard, client profile, live session, trainer mobile, add-client wizard, client progress |
| `docs/design/03-leads-crm.png` | Leads table, lead drawer, mobile lead flows (list, detail, add, book trial, convert, share page) |
| `docs/design/04-client-app.png` | 12 client mobile screens |

Boards show placeholder people, names, numbers and photos — never reuse them, and never extract images from the boards.

### 7.1 Tokens (CSS variables → Tailwind theme)

```
--charcoal:        #18211D   sidebar, dark hero, dark buttons ("Next", "Start")
--lime:            #C8F169   primary action, selected nav, positive accents
--lime-hover:      #A9D846
--lime-foreground: #18211D   text on lime (never white on lime)
--background:      #F6F7F3
--card:            #FFFFFF
--foreground:      #18201C
--muted-foreground:#6C756F
--border:          #E6EAE5
--success / --warning / --danger / --info (+ *-soft backgrounds), all ≥ 4.5:1 for text
```
Stage pills: New = soft blue, Contacted = soft amber, Trial Booked = soft pink, Interested = soft green, Converted = lime, Lost = grey — always with a text label.
Radius: card 16px, controls 12px, pills full. One subtle card shadow, one drawer shadow. 4px spacing scale. Icons 16/20/24. Touch targets ≥ 44px.

### 7.2 Shared components
AppShell (sidebar/topbar/bottom-nav), PageHeader, KpiCard, DataTable ↔ CardList, FilterBar (search + selects + stage tabs with counts), StatusPill, Drawer (right on desktop / full-screen on mobile), Stepper, EmptyState, ErrorState, PermissionDenied, ConfirmDialog, DateTimePicker (timezone-aware), PhoneInput (country code + E.164), SegmentedControl, RatingSlider (1–10), EmojiScale (Great/Good/Okay/Tired/Poor with labels), TrendChart (units/tooltips/empty state), MiniSparkline, Avatar (initials fallback), QRCodeCard, Toast, OfflineBanner, NotConfiguredNotice.

### 7.3 What NOT to copy from the reference images
- **No third-party brand logos** or "Trusted by 5,000+ trainers" / "#1 Platform" claims unless backed by real, permitted data.
- **No invented ratings/reviews** ("4.9 (124 reviews)").
- **No sample KPI numbers or deltas** — every number comes from the database; deltas only when the comparison period has data.
- **No "Strength +47%" composite scores.** Strength is per exercise (e.g. best estimated 1RM via Epley, labelled "estimate") or omitted.
- **No cross-client "progress %" averages.**
- **Imagery:** licensed photos stored in the repo/bucket with attribution in `docs/assets.md`, or gradient/illustration placeholders. Never hotlink.

**Mockup → MVP adjustments**
| Mockup shows | MVP builds instead |
|---|---|
| Trainer dashboard KPI "New messages" | "Payments due / packages expiring" |
| Client "Messages with Trainer" chat | "Contact trainer" card (WhatsApp, call) |
| Client "Nutrition Plan" with kcal ring | Not shown |
| "Client Progress Overview %" multi-metric chart | Per-metric charts on client detail only |
| Pricing page with 4 plan cards + "Start Free Trial" | "Free during beta" hero + request access |
| Platform overview revenue/MRR/payments cards | Hidden until billing is live ("Billing not configured" notice) |
| Lead drawer "Files" tab | Not shown |
| Client home "Progress −2.4 kg since Jan" tile | Only when weight is shared; plus a "Sessions left" tile from the package |

### 7.4 Accessibility (WCAG 2.2 AA target)
Keyboard paths everywhere (incl. reorder alternatives); visible focus ring; labelled inputs and icon buttons; Radix dialogs with focus trap/return; `prefers-reduced-motion`; text summaries for charts; errors linked via `aria-describedby`; no colour-only status.

---

## 8. Trainer features

### 8.1 Dashboard (`/app/dashboard`) — "What do I need to do today?"
- **Header:** greeting (trainer local time), date with prev/next day, notifications bell, profile menu. (Global ⌘K search is v1.1; each list page has its own search.)
- **First-run checklist card** (shown until complete or dismissed): ① publish your public page ② add your first lead or client ③ assign a program (start from a template) ④ invite a client via WhatsApp. Each step links to the screen and ticks itself from real data.
- **KPI cards** (each links to a filtered screen): Sessions today (in-person/online split) · Active clients · New leads (7 days) · Follow-ups due/overdue · Check-ins to review · **Payments due / packages expiring**. Served by one `GET /dashboard/summary` query set — no N+1. On mobile, a horizontal scroll of compact cards.
- **Today's schedule:** person, session type, start + duration, mode, location or meeting link, status, contextual action (Start / Join / View / mark attendance).
- **Needs attention** (ordered): overdue follow-ups → due today → trials in next 48h → **payments due** → **packages with ≤ 2 sessions left or expiring within 7 days** → check-ins to review → sessions needing attendance marked → clients with no check-in for N days / no measurement for M days (configurable). Payment and package items have a one-tap **WhatsApp reminder** using the payment template (§8.12). No diagnoses.
- **Recent activity** from `activity_events`.

#### 8.1.1 Metric definitions (`packages/shared/metrics.ts` + `docs/metrics.md`; workspace timezone)
- *Sessions today* = appointments of every kind (trials counted separately in the caption) starting today with status ∈ {scheduled, confirmed, completed}.
- *Active clients* = clients with `status = 'active'`.
- *New leads* = leads created in the last 7 days.
- *Follow-ups due* = open follow-ups with `due_at ≤ end of today`; *overdue* = `due_at < now()`.
- *Check-ins awaiting review* = `reviewed_at IS NULL`.
- *Adherence* = completed ÷ planned workout sessions in period (only where a plan exists).
- *Attendance* = attended ÷ (attended + no-show) appointments in period.
- *Sessions left* = `sessions_included − count(package_session_ledger rows with uses_session = true)` for the active package.
- *Package expiring* = active package with `expires_on` within 7 days, or sessions left ≤ 2 (thresholds in Settings).
- *Payment due* = active package whose `amount_due_paise − sum(payments)` > 0 and whose `payment_due_on ≤ today`.

### 8.2 Lead CRM (`/app/leads`)

**Capture:** manual entry · public enquiry page `/coach/[slug]` · shareable URL with `?src=&utm_*` · server-generated QR (PNG/SVG) · WhatsApp click-to-chat (`https://wa.me/<E164>?text=`). Disabled integration boundaries for Meta Lead Ads and WhatsApp Business Platform.

**Stages:** `new → contacted → trial_booked → interested → converted`, plus `lost` (`lost_reason`, optional `nurture_until`). Every change writes `lead_activities (type='stage_changed', from, to, actor)`. `converted` is set only by the conversion service.

**List screen:** title "Leads" + subtitle "Capture, track and convert more clients."; KPI cards (open leads, new this week, follow-ups due incl. overdue, upcoming trials, converted this month); stage tabs with counts; search (name, phone, email, goal, source — `pg_trgm`); filters (stage, source, mode, follow-up range); sort (next follow-up default, created, name); **List** view (the Kanban board is **v1.1**); Add Lead; Share Enquiry Page; bulk stage change; CSV export. Row: avatar/initials, name, goal, source (icon + label), mode, stage pill, next follow-up (red Today/Overdue), last contact, actions (call, WhatsApp, schedule, ⋯). Mobile: card list with stage chips and overdue dot.

**Detail drawer** (`/app/leads/[id]` deep-linkable): header (avatar, name, stage pill, summary). Actions: WhatsApp · Call · Schedule. Tabs (MVP: Overview with inline edit, Activity, Notes; *Files* is v1.1): *Overview* (contact with copy, goal, mode, source, enquiry date, preferred time, location, original message, **Next Action** card with overdue badge, trial info) · *Activity* (timeline: enquiry, logged calls/messages/emails with outcome, follow-ups, trial events, stage changes, conversion) · *Notes* (private) · *Details* (editable incl. campaign, referrer). Footer: **Book Trial Session** · **Convert to Client**. Overflow: Edit, Mark lost, Delete (only if no activity; otherwise archive).

**Add Lead:** required — full name, at least one of phone/email, primary goal, source. Optional — mode, preferred schedule, location, interested service, referrer, campaign, notes, next follow-up. Phone → E.164 (workspace country). Email trimmed/lower-cased. **Duplicate detection** on normalized phone/email across leads *and* clients in the workspace → non-blocking "Possible match" panel with Open / Create anyway.

**Follow-ups:** lead, action type (`whatsapp | call | email | trial_confirmation | package_discussion | other`), `due_at`, status (`open | done | skipped`), notes, `completed_at`, reminder (`none | in_app`; `email` is v1.1). Completing asks for an outcome and offers the next follow-up. The WhatsApp action opens click-to-chat prefilled from the matching message template (§8.12) and logs a `communication_logs` row when the trainer confirms "Sent". Reminders created by pg-boss jobs; "sent" shown only if a `notification_deliveries` row exists.

**Trial booking:** creates `appointments (kind='trial', lead_id)` with date, start, duration, mode, location or link, notes, status (`scheduled | confirmed | completed | cancelled | no_show`). Overlaps rejected by the DB exclusion constraint → "You already have *Sarah Chen — Strength* at 6:00 PM". Lead → `trial_booked`. Outcome recording never converts.

**Public enquiry page `/coach/[slug]`:** trainer photo, name, headline, location, coaching types, mode cards, intro, form (name, phone with country code, email optional, goal, preferred mode, days/times, message), privacy notice + versioned consent checkbox, success/error states. Protections: honeypot, minimum time-to-submit, Postgres rate limit (hashed IP + per workspace), Turnstile when configured, Zod, length caps. `POST /public/enquiries` runs under `fitcoach_system` in a narrow service that only inserts the lead + consent + activity + notification and returns `{ ok: true }`. Published page data is read via a public read model exposing only whitelisted fields.
**Share screen:** copyable URL, QR (download), Web Share, preview, per-source links.

**Lead → client conversion** (`POST /leads/:id/convert`, Idempotency-Key, single DB transaction):
1. `SELECT … FOR UPDATE` the lead (workspace-scoped). Already converted → return existing `client_id`.
2. Match existing clients by normalized phone/email; if trainer chose *link*, link instead of insert.
3. Check the workspace's active-client limit (from `workspace_plans`, set by the platform owner during the beta) inside the transaction → `PLAN_LIMIT` error if exceeded.
4. Insert client (`active` or `onboarding_draft`) copying name, contacts, goal, mode, preferences, attribution, `source_lead_id`.
5. Optional initial package (§8.3A) + coaching start date.
6. Update lead (`converted`, `converted_client_id`, `converted_at`, `converted_by`), write activity + `activity_events`.
7. Commit. Unique `clients(workspace_id, source_lead_id)` + idempotency key guarantee exactly one client even under concurrent clicks; any failure rolls back everything.
UI: confirm sheet → **Convert & Continue** → onboarding wizard prefilled at first incomplete step.

### 8.3 Clients (`/app/clients`)
Tabs Active / Paused / Archived (counts); search, filters (goal, mode, program, last check-in age), sort. Row/card: avatar, name, goal, mode, status, next session, last check-in, progress indicator only with ≥ 2 data points.
**Detail** (`/app/clients/[id]`): hero (photo, name, status, mode, age if DOB, location, timezone). Tabs: Overview · **Packages** · Workouts · Schedule · Check-ins · Progress · Notes. Overview: goal (+ target text/date), **package card** (name, sessions left, expiry, amount due, "Record payment"), weeks with you, sessions completed, check-in consistency (definition on tap), latest measurements + sparklines, next appointment, recent activity, quick actions (Log session, Record payment, Update progress, WhatsApp).
**Lifecycle:** active ↔ paused ↔ archived. Archiving revokes the client's sessions and portal access; history preserved. Hard delete only via the deletion workflow (§12.4).
**Portal access (MVP — WhatsApp invite link):** "Invite via WhatsApp" → API creates `auth_tokens (purpose='client_invite')` (32 random bytes, hashed, 7-day expiry, single use) → web opens `https://wa.me/<client E164>?text=<invite template with {link}>` → client taps `/invite/[token]` → API consumes the token, links/creates the client's `users` row, sets a **60-day session** and lands them on `/client/home`. Re-login: `/client/login` with **email OTP**, or the trainer sends a fresh invite link. Status shown: not invited / invited (expires on …) / active / revoked. Regenerating revokes older unused links. Clients without a phone get the same link by email. (Scoped check-in links without login are **v1.1**.)
**Per-client feature flags:** workout self-logging, check-ins (+ frequency), progress self-logging. (Nutrition and messages flags are Later.)

### 8.3A Packages, sessions & payments (MVP core)
Trainers sell session packs ("12 sessions in 6 weeks"), monthly plans ("unlimited, 1 month") and online coaching ("3 months online"). FitCoach tracks what was sold, what's been used and what's been paid — **it does not process payments.**

**Package types** (`client_packages.kind`): `session_pack` (N sessions, optional expiry) · `time_based` (unlimited or N/week within start–end) · `online_coaching` (time-based, no session deduction).
**Fields:** client, name (from a workspace package preset or custom), kind, `sessions_included` (nullable for time-based), `starts_on`, `expires_on` (nullable), `price_paise`, `amount_due_paise` (defaults to price; supports discounts), `payment_due_on`, status (`active | completed | expired | cancelled`), notes. One **active** package per client at a time (partial unique index); a renewal creates a new package and closes the previous one (`completed` when sessions are used up, `expired` after `expires_on`).
**Package presets** (Settings): reusable name, kind, sessions, duration, default price — so selling a package is two taps.
**Session deduction:** when an appointment linked to a client is marked `completed` (or `no_show` / late-cancel per the D25 policy), the service writes one `package_session_ledger` row (`package_id`, `appointment_id`, `reason: attended | no_show | late_cancel | manual_adjustment`, `uses_session`, actor) **inside the attendance transaction**. Unique `(package_id, appointment_id)` makes it idempotent; undoing attendance writes a reversing row (never deletes). Manual adjustments need a note. If no active package exists, attendance still saves and the client shows "No active package".
**Payments** (`client_payments`): amount, method (`cash | upi | bank_transfer | card | other`), paid_on, reference (optional), note, linked package. Append-only; corrections are a voiding row with a reason. Labelled "recorded manually" everywhere. Amount due = `amount_due_paise − sum(valid payments)`.
**UI:** client detail → Packages tab (active package card with progress bar "8 of 12 used", history, payments list, "Sell / renew package", "Record payment"); sell-package sheet usable from conversion and onboarding; dashboard "Payments due" and "Packages expiring" groups with a WhatsApp reminder button; clients list filter "sessions left ≤ 2 / payment due".
**Client view:** sessions left and expiry only (no prices or payment history).
**Rules:** amounts in paise (integers); INR display with Indian digit grouping (₹1,23,456); no negative sessions-left — at 0 the next attendance prompts "Renew package or record without package".

### 8.4 Add Client onboarding wizard (`/app/clients/new`, `?draft=`, `?fromLead=`)
4 steps, **Save as Draft** on every step (`client_onboarding_drafts`, resumable).
1. **Basic information** — full name*, phone, email, preferred contact, DOB (optional), photo (optional), emergency contact (optional, restricted).
2. **Goals & training** — primary goal*, secondary goals, mode* (with descriptions), location/online preference, preferred days/times, experience, equipment, start date, optional program.
3. **Baseline & consent** — optional measurements (date + unit each), limitations/notes (restricted), consents: *data processing* (required) and *progress photos* (separate, optional — captured now, used when photos ship in v1.1) — each with notice version, timestamp, status, source, actor.
4. **Review & create** — summary, missing-required highlights, Create Client, optional **package** (§8.3A) and program assignment, then "Invite via WhatsApp" prompt.
Optional fields never block creation. Finalize is one transaction.

### 8.5 Programs, exercises & workouts
**Exercise library:** global seed (`workspace_id NULL`, read-only, **~100 common gym, dumbbell, bodyweight, band and mobility exercises** shipped as a migration) + custom exercises. Name, instructions, muscle groups, equipment, category, media **URL** (licensed; uploads are v1.1), difficulty, substitutions, safety notes. Filters by muscle group, equipment and category; search by name.
**Starter program templates** (global, read-only, copy-to-edit; shipped as a migration): Beginner Full Body 3×/week · Fat Loss Circuit 4×/week · Upper/Lower 4×/week · Push/Pull/Legs 6×/week · Home Dumbbell 3×/week · Mobility & Recovery 2×/week · Online Coaching Starter 3×/week. Each is generic, uses only seeded exercises, and makes no outcome claims.
**Program builder** (`/app/programs/[id]`): name, description, goal, duration (weeks), weekly day slots, workouts with ordered exercises (sets, reps or time, target load, rest, trainer notes, client-visible instructions; tempo and per-week progression are v1.1). "Start from template" is the default entry point. Drag-to-reorder + keyboard alternative. Save as template, duplicate.
**Assignment:** client, `program_snapshot jsonb` (copy-on-assign), start date, schedule, status, instructions, equipment/location notes. Generates planned `workout_sessions` for a rolling window (job extends it).
**Session tracking:** `planned → in_progress → completed | skipped`. `workout_sets`: reps, load (kg), duration, RPE (optional), completed flag, `completed_at`, substitution. Trainer/client feedback. Opening a screen never marks anything complete.
**Live workout UI:** current exercise + media, sets (target vs actual), big Complete Set, reps/weight steppers, rest timer, previous/next, "4 of 6 exercises completed" bar, Finish Workout (summary + feedback). Each set `PUT /workout-sets/:clientUuid` (idempotent upsert); refresh restores from the API.

### 8.6 Calendar (`/app/calendar`)
**Views (MVP):** day and week on desktop; agenda list + day view on mobile. Month view is v1.1. Kinds: `session`, `online_session`, `trial`, `consultation`. Each appointment has `starts_at` (timestamptz), `duration_min`, `ends_at` (generated), `timezone` (IANA), status (`scheduled | confirmed | completed | cancelled | no_show`), `cancelled_at`, `cancel_reason`, `late_cancel` (computed from the D25 window), **exactly one** of `client_id`/`lead_id`, location or meeting link, and **session notes** (trainer-only, shown on the client timeline for the trainer). Reschedule (history in `appointment_changes`), cancel (reason), mark attendance (completed / no-show) — attendance triggers package deduction (§8.3A) in the same transaction. Trials visually distinct.
**Recurring series (MVP):** `appointment_series` (client, weekdays, start time, duration, mode, location/link, start date, end date or occurrence count ≤ 52) expands into concrete `appointments` rows at creation; each occurrence is checked against the exclusion constraint and conflicts are listed for the trainer to skip or move before saving. Edit "this occurrence" or "this and following" (future rows regenerated; past rows untouched).
**Conflicts:** overlaps are rejected by the database (§10.3). Availability windows/shading are v1.1.
**Mark attendance prompt:** past appointments still `scheduled/confirmed` appear in "Needs attention" until marked.

### 8.7 Check-ins
Client form (< 1 min): feeling (Great/Good/Okay/Tired/Poor, icon + label), energy 1–10, sleep 1–10, soreness (none/mild/moderate/high), notes, workout feedback. Unique per client per local date; same-day edits until local midnight recorded in `check_in_revisions`. Trainer inbox (`/app/check-ins`): unreviewed first, filters, mark reviewed (+ reply note), per-client trends labelled "self-reported". Configurable frequency (daily / chosen weekdays). **MVP reminders:** a check-in prompt card on the client home when today's check-in is due, plus a trainer **"Nudge"** button that opens WhatsApp with the check-in template. Email and web-push reminders are v1.1. No diagnoses.

### 8.8 Progress
**Measurements:** append-only rows (weight, height, body fat %, waist, chest, hips, custom types). Corrections void (`voided_at`, reason) + insert. Canonical units, display preference.
**Charts:** 1M/3M/6M/1Y/All, date tooltips, units, first vs latest + absolute change; % only when meaningful and labelled; empty state < 2 points.
**Photos — v1.1 (do not build in MVP; kept as reference).** Optional, consent-gated: uploaded via API (max 10 MB input, JPEG/PNG/HEIC/WebP), EXIF stripped, re-encoded with `sharp` to WebP (max 1600 px, ≈80 quality) plus a 400 px thumbnail, stored in the **private R2 bucket** at `progress-photos/{workspace_id}/{client_id}/{uuid}.webp` and `…/{uuid}_thumb.webp`; lists show thumbnails, full size on tap; read via presigned GET ≤ 5 min after an authorization check; rendered `unoptimized` (no Next image cache). Upload refused with a clear message if the storage budget (§17.7) is exhausted.
**Sharing:** `progress_shares` decides which metric types/photos a client sees (default nothing).
**Summaries:** latest measurements, workout consistency, attendance, trainer-set goal status, milestones, trainer feedback. No predictive scores.

### 8.9 Nutrition — Later (not in MVP; no nav item, no tables)
Per-client toggle; goals, meal-plan entries (optional kcal/macros), food notes, client-visible instructions; labelled "trainer guidance", never medical advice; never blocks other flows.

### 8.10 Communication & notifications
**MVP:** no Messages page. Every lead/client drawer has WhatsApp · Call · Email actions; WhatsApp opens click-to-chat prefilled from a message template. A small "Log contact" form (channel, outcome, note) writes `communication_logs`, which appear in the Activity timeline and update `last_contact_at`. The client app shows a **Contact trainer** card (WhatsApp / call) instead of chat.
**In-app notifications (MVP):** new lead, follow-up due, trial in next 2 h, check-in submitted, sessions needing attendance, package expiring, payment due, client accepted invite. Bell + unread count; mark read / mark all read. Clients get in-app notices for new program assigned and session changes.
**Email (MVP):** auth emails only (verify, reset, client OTP, invite fallback). Trainer email notifications are v1.1. Every send writes `notification_deliveries` with provider status.
**Later:** persisted chat threads (SSE + `LISTEN/NOTIFY`), WhatsApp Business Platform automation.

### 8.11 Trainer subscription billing — v1.1
Not in MVP (free beta, D12). When built: plan, status, trial days left, usage vs limits, invoices, upgrade/downgrade/cancel via Razorpay checkout — otherwise a plain "Billing not yet configured" notice. During the beta, Settings shows "You're on the free beta plan" and the client limit set by the platform owner.

### 8.12 Settings (MVP)
- **Profile & public page:** name, photo, headline, bio, location, coaching types, modes, slug, publish toggle, enquiry form fields, consent text version.
- **Message templates** (`message_templates`, one per purpose, editable, reset-to-default): `follow_up`, `trial_confirmation`, `client_invite`, `payment_reminder`, `package_renewal`, `check_in_nudge`, `session_reminder`. Placeholders: `{first_name}`, `{trainer_name}`, `{date}`, `{time}`, `{link}`, `{sessions_left}`, `{amount_due}`, `{package_name}`. Defaults are short, friendly, English. Unknown placeholders are rejected on save; output is URL-encoded for `wa.me`.
- **Packages:** presets (§8.3A), no-show/late-cancel policy (D25), expiry and low-sessions thresholds.
- **Check-ins & attention rules:** default frequency, "no check-in for N days", "no measurement for M days".
- **Units & locale:** kg/lb, cm/in, timezone (default `Asia/Kolkata`), country (default `IN`).
- **Security:** change password, active sessions with revoke. (Trainer MFA v1.1.)
- **Data export:** CSV of leads, clients, appointments, packages, payments, measurements (zip, presigned link, 24 h).
- **Help:** beta FAQ link, "Send feedback" (§16.0), contact the founder via WhatsApp/email.
- **Plan:** read-only "Free beta plan, up to N active clients".

---

## 9. Client experience (`/client/*`)
Calmer than the trainer app; one primary action per screen.
- **Arrival:** `/invite/[token]` (from WhatsApp) → welcome screen with the trainer's name/photo → accepts terms/privacy → lands signed in. **Login** (`/client/login`): dark hero, "Get a sign-in code by email" (6-digit OTP), and "Ask your trainer for a new link" helper. (Google sign-in is Later.)
- **Home:** greeting, week strip, **check-in prompt** when due, Today's Workout card (Start/View), next session, **Sessions left** tile (from the active package, with expiry), shared-metric tiles only, streak (consecutive weeks meeting planned sessions).
- **My Workouts:** Upcoming/Past by week; Start/View. **Workout details:** trainer notes, equipment, est. time, muscle groups, exercises → live workout (only if self-logging is enabled; otherwise read-only).
- **Check-in:** §8.7 + confirmation screen ("Sent to {trainer_name}").
- **Progress:** shared metrics only, with charts; add a measurement only if self-logging is enabled.
- **More:** Schedule (own appointments, no trainer notes), **Contact trainer** (WhatsApp / call), Profile (name, contact preference, units; goals read-only), Help, Sign out.
Clients never see leads, other clients, trainer notes, session notes, assessments, prices, payment records, unshared data, business metrics or settings.

---

## 10. Database

### 10.1 Conventions
UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` (trigger), `created_by`, status enums (Postgres enums or CHECK), snake_case, every FK indexed, length CHECKs on user text, `citext` emails. Extensions: `pgcrypto`, `citext`, `btree_gist`, `pg_trgm`. Drizzle schema files mirror the SQL; SQL migrations are authoritative.

### 10.2 Tables

**Identity & auth:** `users`, `user_identities`, `sessions`, `auth_tokens`, `mfa_factors`, `mfa_recovery_codes`, `profiles`.
**Workspace:** `workspaces`, `workspace_members`, `trainer_settings` (incl. package policy, thresholds, units), `trainer_public_pages`, `message_templates`, `package_presets`. *(v1.1: `trainer_availability`, `check_in_links`.)*
**Lead CRM:** `leads` (workspace_id, full_name, phone_e164, email, goal, training_mode, source, campaign, utm jsonb, referrer, stage, lost_reason, next_follow_up_at (trigger-maintained), last_contact_at, converted_client_id, converted_at, converted_by), `lead_activities`, `lead_follow_ups`, `lead_forms`, `lead_consents`.
**Clients:** `clients` (workspace_id, user_id, source_lead_id, status, names, contacts, dob, timezone, features jsonb, emergency_contact jsonb), `client_goals`, `client_consents`, `client_notes`, `client_packages`, `package_session_ledger`, `client_payments`, `client_onboarding_drafts`.
**Workouts:** `exercises`, `programs` (with `is_template`, `workspace_id NULL` for global starter templates), `program_workouts`, `program_exercises`, `client_program_assignments`, `workout_sessions`, `workout_session_exercises`, `workout_sets`.
**Scheduling:** `appointment_series`, `appointments`, `appointment_changes`.
**Progress & check-ins:** `measurement_types`, `measurements`, `check_ins`, `check_in_revisions`, `progress_shares`. *(v1.1: `progress_photos`.)*
**Nutrition (Later):** `nutrition_plans`, `nutrition_plan_items`.
**Communications:** `communication_logs` (MVP); `message_threads`, `messages` (Later).
**Supporting:** `files` (bucket: private|public, object key, owner workspace, kind, mime, size_bytes, width, height, visibility, checksum, deleted_at — the source of truth for storage usage), `notifications`, `notification_deliveries`, `activity_events`, `email_outbox`, `rate_limit_buckets`, `idempotency_keys`, `audit_logs`, `product_events` (actor, workspace, event name, properties jsonb, occurred_at — no PII), `feedback` (workspace, user, page, message, status). *(v1.1: `deletion_requests`.)* (pg-boss manages its own `pgboss` schema.)
**Platform (MVP):** `platform_roles`, `subscription_plans` (seeded: `beta` — free, configurable active-client limit), `workspace_plans` (workspace, plan, trial/expiry dates, assigned_by — the manual assignment record), `platform_settings`, `beta_invites` (code hash, uses, expires).
**Platform (v1.1+, don't create yet):** `plan_entitlements` editor tables, `subscriptions`, `billing_customers`, `billing_events`, `invoices`, `support_tickets`, `support_ticket_events`, `platform_announcements`, `announcement_reads`, `support_access_grants`.

**MVP table rule:** create a table only in the migration of the slice that first uses it. Never create v1.1/Later tables "just in case".

### 10.3 Integrity guarantees in the database
- Appointment overlap: `EXCLUDE USING gist (workspace_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status IN ('scheduled','confirmed'))`.
- `appointments`: `CHECK (num_nonnulls(client_id, lead_id) = 1)`.
- `check_ins`: `UNIQUE (client_id, local_date)`.
- `clients`: `UNIQUE (workspace_id, source_lead_id)`; partial uniques on `(workspace_id, phone_e164)` / `(workspace_id, email)` for non-archived clients.
- `lead_follow_ups`: `CHECK (status <> 'done' OR completed_at IS NOT NULL)`.
- `client_packages`: partial `UNIQUE (client_id) WHERE status = 'active'`; `CHECK (sessions_included IS NULL OR sessions_included > 0)`; money columns are `bigint` paise ≥ 0.
- `package_session_ledger`: `UNIQUE (package_id, appointment_id) WHERE appointment_id IS NOT NULL AND reverses_id IS NULL`; reversals reference the original row; no UPDATE/DELETE grants.
- `client_payments`: append-only (voids are new rows referencing the original).
- `message_templates`: `UNIQUE (workspace_id, purpose)`.
- `appointment_series`: occurrences ≤ 52; `CHECK (end_date IS NOT NULL OR occurrence_count IS NOT NULL)`.
- `billing_events` (v1.1): `UNIQUE (provider, provider_event_id)`.
- `sessions.id`, `auth_tokens.token_hash`: unique; tokens single-use via `consumed_at`.
- Composite FKs `(workspace_id, parent_id)` on child tables so children can't reference another tenant's parent.
- Limit trigger on `clients` → `active` enforces the workspace's active-client limit from `workspace_plans` (MVP); the full entitlements model is v1.1.
- `audit_logs`: `fitcoach_app` has INSERT only (no UPDATE/DELETE).

### 10.4 Transactions
Multi-record operations run in **one transaction in the service layer** (Drizzle `db.transaction`), with row locks where races matter: enquiry submit, lead conversion (+ package), onboarding finalize, program assignment (+ session generation), recurring series creation, **attendance marking (+ package ledger)**, package renewal, workout completion, invite acceptance. (v1.1: billing event application, deletion execution.) SQL functions are optional helpers (e.g. `app.check_rate_limit(key, window_seconds, max)`), not the main business layer.

### 10.5 RLS strategy
- RLS **enabled and forced** on every tenant table; a test fails CI if any table in the `public` schema lacks it (allow-list for global reference tables like `subscription_plans`, readable by all).
- Context helpers (SQL, `stable`): `app.current_user_id()`, `app.current_workspace_id()`, `app.current_client_id()`, `app.current_actor()` read `current_setting('app.*', true)`; empty → NULL → no rows.
- Trainer policies: `workspace_id = app.current_workspace_id() AND app.current_actor() = 'trainer'`; write policies also require the workspace to be writable (not suspended).
- Client policies: `client_id = app.current_client_id() AND app.current_actor() = 'client'` plus feature flag/`progress_shares` checks. Column restrictions through client-facing **views** (e.g. `client_portal_appointments` without notes) — the client API reads only those views.
- `fitcoach_system` bypasses RLS; every use is wrapped, reasoned and audited (§4.5).
- Document policies in `docs/rls.md`; test them (§19).

### 10.6 Migrations, seed, versions
- `pnpm db:generate` (drizzle-kit) for table diffs → review → add hand-written SQL for RLS/constraints/triggers in the same migration. Forward-only, **expand → migrate → contract**, backward-compatible with the release currently running on Railway.
- Migration runner: `apps/api/dist/db/migrate.js` (Drizzle migrator using the owner URL) — runs locally via `pnpm db:migrate` and on Railway via `preDeployCommand`. It also bootstraps roles and runs pg-boss schema setup.
- `pnpm db:seed` (dev only): demo trainer, demo clients with packages, sample leads/appointments/workouts/check-ins. Refuses to run when `APP_ENV=production`.
- **Production reference data ships in migrations:** ~100 global exercises, 7 starter program templates, default message templates (copied into each new workspace on signup), default package presets, measurement types, the `beta` plan.

---

## 11. Integrations (boundary + dev fallback for every one)

| Integration | Interface | Prod adapter | Local / dev | "Not configured" behaviour |
|---|---|---|---|---|
| Storage | `StorageService` (put, presignGet, publicUrl, delete, usage) | Cloudflare R2 (private + public buckets) | MinIO in Docker (private bucket + anonymous-read public bucket) | uploads disabled with notice |
| Email | `EmailProvider.send()` | SMTP or Resend | Mailpit (SMTP) or `console` → `email_outbox` | auth emails blocked in prod → health shows "Degraded" |
| Billing (v1.1) | `BillingProvider` | Razorpay | `manual` | not built in MVP; plan assignment is manual |
| Captcha | `CaptchaVerifier` | Cloudflare Turnstile | always-pass (non-prod only) | honeypot + timing + rate limit still apply |
| Google sign-in (v1.1) | `OAuthProvider` | Google (arctic) | hidden | button hidden |
| WhatsApp | `WhatsAppLinkBuilder` (template render + `wa.me` URL) | click-to-chat (MVP) | same | Business Platform API is Later |
| Meta Lead Ads | `LeadIngestion` | future webhook | — | hidden |
| Monitoring | `Monitor` | Sentry (optional) | pino logs | health shows "Not configured" |

Webhooks (`POST /webhooks/billing/:provider` on the API's public domain): raw body (`rawBody: true` in Nest), HMAC verify with constant-time compare, insert into `billing_events` (unique id → idempotent), process in a pg-boss job inside a transaction, respond 200 fast.

---

## 12. Security, privacy & compliance

### 12.1 Must-haves
Guards on every controller; RLS everywhere; Zod on every input; Postgres-backed rate limits (login, OTP, reset, enquiry, invite acceptance); captcha-ready public forms; secrets only in Railway variables; `lib/env.ts` (web) and `ConfigModule` with Zod (api) refuse to boot on missing/invalid config or secrets under `NEXT_PUBLIC_`; private bucket + presigned URLs; helmet + CSP/HSTS/Referrer-Policy/Permissions-Policy; safe errors; audit logs; consent records; no PII in logs/analytics (hash IPs with `IP_HASH_SALT`); `pnpm audit` in CI.

### 12.2 Authentication
- **Passwords:** argon2id; min length 10, block common passwords; constant-time responses for login/reset to avoid account enumeration.
- **Sessions:** 32 random bytes → cookie `fc_session` (`httpOnly; Secure; SameSite=Lax; Path=/`), stored as SHA-256 in `sessions`. Trainers 30-day sliding, clients 60-day sliding, platform owners 12 h absolute + AAL2. Rotate on login/privilege change; revoke on logout, password change, archive, suspension. "Active sessions" list in Settings.
- **Trainer signup** requires email verification and, during the closed beta, a valid beta invite code (`beta_invites`) or platform-owner approval.
- **Client invite link** (D19): `client_invite` token, 7-day, single use, revocable; acceptance creates or links the client's user and a 60-day session; rate-limited per IP; the link never reveals the client's data before it is consumed.
- **Client re-login:** 6-digit email OTP (10-min expiry, 5 attempts, rate-limited per email and IP).
- **Google OAuth (v1.1)** (PKCE, state, nonce) links to existing verified email only.
- **MFA:** TOTP with encrypted secrets (AES-256-GCM, `APP_ENCRYPTION_KEY`) + one-time recovery codes; mandatory for platform owners (MVP); optional for trainers (v1.1).
- **CSRF:** SameSite=Lax cookie + API rejects state-changing requests unless `Origin` matches `WEB_ORIGIN` and header `X-FitCoach-Request: 1` is present.
- **Platform owner** grant only via `pnpm platform:grant <email>` (CLI against the DB, audited); `/platform/login` separate page.

### 12.3 Object-level protection
Repositories always scope by the session's workspace/client; RLS catches mistakes. IDs are UUIDs; all tokens are random, hashed, expiring, revocable. Never accept `workspace_id` or `client_id` from the request body for authorization.

### 12.4 Retention & deletion
**MVP:** CSV export (§8.12) and a documented **manual deletion procedure** in `docs/runbooks/data-deletion.md` (platform owner runs an audited CLI command that deletes a client's rows and files). The automated workflow below is v1.1.
Workspace export (JSON/CSV zip in the private R2 bucket under `exports/`, presigned link, deleted after 24 h by a job and an R2 lifecycle rule). Client deletion request: 7-day cancellable window → job hard-deletes rows + files, keeps anonymized aggregates + audit record. Lost-lead auto-anonymization after a configurable period. Privacy page describes practices factually; no compliance-certification claims.

---

## 13. Background jobs (pg-boss in the API)
pg-boss runs in each API replica (`SKIP LOCKED` → no duplicates). Recurring schedules via `boss.schedule()` (distributed, one fire per tick), handlers idempotent with dedupe keys.

**MVP jobs:**
- follow-up due/overdue → in-app notifications (per workspace timezone) — every 5 min
- trials starting in 2 h → in-app notification — every 5 min
- past appointments still unmarked → "needs attendance" notification — hourly
- packages: mark `expired` after `expires_on`; notify ≤ 2 sessions left / expiring in 7 days / payment due — daily 07:00 workspace time
- extend planned workout sessions window — daily
- expire invite tokens and OTPs; purge `rate_limit_buckets`, `idempotency_keys`, expired `sessions` — hourly
- export generation and auth email sending (queue with retries + backoff)
- storage ledger reconciliation against R2 — weekly

**v1.1 jobs:** email/web-push reminders, subscription grace transitions + billing reconciliation, deletion workflow.

Each run records outcome (pg-boss archive + summary) for the Platform Health page. Graceful shutdown on `SIGTERM` (`boss.stop({ graceful: true })`).

---

## 14. Progressive Web App
Manifest (FitCoach, charcoal theme colour, `#F6F7F3` background, maskable 192/512 icons, `standalone`). `/` redirects signed-in users to their home. Service worker: precache shell/static assets; **network-only** for `/api/*` and authenticated HTML; offline fallback page. Safe-area insets. Install prompt in More/Settings (with iPhone "Add to Home Screen" instructions). Offline banner + disabled saves (D15). Web push is v1.1 (on iPhone it only works for installed home-screen apps).

---

## 15. Routes & API surface

**MVP route rule:** create only the routes listed under MVP. Deferred routes don't exist (no placeholder pages).

**Web — public (MVP):** `/` · `/pricing` · `/beta` · `/login` · `/signup` (Account → Profile → Business, beta code) · `/forgot-password` · `/reset-password` · `/verify-email` · `/coach/[slug]` · `/privacy` · `/terms` · `/invite/[token]` *(v1.1: `/auth/google/callback`, `/c/[token]`)*
**Web — trainer (MVP):** `/app/dashboard` · `/app/leads` · `/app/leads/[id]` · `/app/clients` · `/app/clients/new` · `/app/clients/[id]` · `/app/calendar` · `/app/programs` · `/app/programs/[id]` · `/app/exercises` · `/app/workouts` · `/app/workouts/[sessionId]` · `/app/check-ins` · `/app/progress` · `/app/settings` · `/app/settings/[section]` *(v1.1: `/app/billing`, `/app/templates`; Later: `/app/nutrition`, `/app/messages`)*
**Web — client (MVP):** `/client/login` · `/client/home` · `/client/workouts` · `/client/workouts/[id]` · `/client/check-in` · `/client/progress` · `/client/schedule` · `/client/contact` · `/client/profile` *(Later: `/client/nutrition`)*
**Web — platform (MVP):** `/platform/login` · `/platform/dashboard` · `/platform/trainers` · `/platform/trainers/[id]` · `/platform/feedback` · `/platform/health` · `/platform/audit-logs` · `/platform/settings` *(v1.1: `/platform/subscriptions`, `/platform/plans`, `/platform/support`; Later: `/platform/analytics`, `/platform/announcements`, `/platform/clients`)*
**Web — infra:** `/api/[...path]` (proxy) · `/healthz` (web liveness)

**API (prefix `/v1`, reached as `/api/v1/*` through the web proxy):**
**MVP:** `auth/*` (signup, login, logout, me, verify-email, otp/request, otp/verify, password/forgot, password/reset, invite/accept, mfa/* for platform owners, sessions) · `workspace` · `settings/*` · `message-templates` · `package-presets` · `public/pages/:slug` · `public/enquiries` · `leads` (+ `/:id/activities`, `/:id/follow-ups`, `/:id/trial`, `/:id/convert`, `/duplicates`) · `follow-ups` · `communications` · `clients` (+ `/:id/invite`, `/:id/archive`, `/:id/restore`) · `onboarding-drafts` · `packages` (+ `/:id/payments`, `/:id/adjustments`, `/renew`) · `exercises` · `programs` (+ `/templates`, `/:id/duplicate`) · `assignments` · `workout-sessions` · `workout-sets/:id` · `appointments` (+ `/:id/attendance`, `/:id/reschedule`, `/:id/cancel`) · `appointment-series` · `check-ins` · `measurements` · `progress-shares` · `notifications` · `files` · `exports` · `dashboard/summary` · `feedback` · `product-events` · `client-portal/*` (client-scoped reads/writes) · `platform/*` (MFA-guarded) · `health`, `health/ready`.
**v1.1:** `auth/google/*`, `public/check-in/:token`, `availability`, `progress-photos`, `billing/*`, `support/tickets`, `webhooks/billing/:provider`, `search`.
OpenAPI served at `/v1/docs` **only outside production**.

`proxy.ts` (web): if no `fc_session` cookie, redirect `/app`, `/client`, `/platform` to the right login. Layouts call `GET /v1/auth/me` server-side and redirect by actor/role; the API enforces everything regardless.

---

## 16. Platform Owner & SaaS administration (Module 29)

### 16.0 MVP scope (closed beta)
Build only this in the MVP; §16.1 is the v1.1+ reference.
- **Role & access:** `platform_owner` granted only via `pnpm platform:grant <email>` (audited CLI). Separate `/platform/login`, **TOTP MFA required** (AAL2), 12-hour absolute session. Not a trainer with extra buttons.
- **Overview:** real counts only — total trainers, active this week, suspended, pending approval, total active clients (aggregate), activation rate (§1A.5), invites accepted, feedback awaiting review, failed jobs (24 h). No revenue, MRR or payment cards ("Billing not configured").
- **Trainers:** search/filter (status, signup date, last active), detail with onboarding checklist progress, plan and limit, usage counts (leads, clients, appointments, workouts — counts only, no client PII), last active; actions: **approve signup**, **assign plan / change client limit / set trial end** (writes `workspace_plans`), suspend/reactivate (reason required, trainer notified in-app), send password-reset email, revoke sessions. All audited.
- **Beta invites:** create/revoke invite codes (hashed), see uses.
- **Feedback inbox:** list `feedback` rows (trainer, page, message, date), mark triaged/closed. Trainers submit via "Send feedback" in More/Settings (page URL attached automatically; no screenshots in MVP).
- **Health:** DB connectivity, pg-boss queue lag + failed jobs (24 h), last successful backup (from `db-backup` heartbeat), email provider, R2 reachability, **storage used vs budget** — each OK / Degraded / **Unknown**.
- **Audit logs:** filterable table (actor, action, target, time), immutable.
- **Suspension:** workspace read-only + banner + export allowed; client portal read-only; nothing deleted.

### 16.1 Full module (v1.1+, reference — do not build in MVP)

**Role:** `platform_owner` in `platform_roles`, granted only via the audited CLI. Not a trainer with extra buttons. Enforced by `RolesGuard` + `PlatformMfaGuard` (AAL2) + system-role aggregate queries.

**Dashboard** (period selector): total trainers, active/suspended, trialing, paying, active clients (aggregate), **estimated MRR** (active subscriptions normalized to monthly — labelled estimate), **collected revenue** (paid invoices in period), trial→paid conversion (cohort definition documented), renewals & failed payments, open/urgent tickets, job/webhook failures. Revenue chart, trainers-by-plan donut, recent signups, activity feed. Real data or empty states only.

**Trainers:** search/filter (status, plan, signup date); detail with onboarding status, subscription, usage (client counts, last active), support history; actions: suspend/reactivate (reason required, audited, trainer notified), send password-reset email, revoke sessions, resolve config issues. No passwords, no client PII. **Suspension** = workspace read-only + banner + export allowed; client portal read-only; nothing deleted.

**Plans & entitlements:** CRUD plans (name, price in paise, interval, trial days, active, order) and entitlements (`max_active_clients`, `max_progress_photos_per_client`, `advanced_analytics`, `custom_branding`, `nutrition`, `trainer_seats`, `automations`). Launch hypotheses (configurable): Free Trial 14 days (5 clients) · Solo ₹499/mo (20) · Pro ₹999/mo (100 + advanced features) · Studio ₹1,999+/mo (hidden until multi-trainer exists). `/pricing` reads active plans from the API at request time.

**Subscriptions:** `trialing → active → past_due → (grace) → suspended | cancelled`; upgrade/downgrade, cancel at period end, invoices, payment status, reconciliation report (provider vs DB). Changes only from verified webhooks, jobs or audited owner actions.

**Support:** tickets (requester, workspace, category, priority, description, assignee, status, events, resolution). Trainers open tickets from Settings. **Exceptional support access** = `support_access_grants` (purpose, approver, ≤ 24 h, read-only), every read audited. No unrestricted impersonation.

**Announcements:** targeted by plan/status, scheduled, dismiss tracking. **Analytics:** acquisition, activation (first lead / first client), conversion, plan distribution, churn, feature adoption, support volume — with definitions. **Health:** DB connectivity, pg-boss queue lag + failed jobs (24 h), last successful backup (from `db-backup` heartbeat), webhook failures, email provider, R2 reachability + **storage used vs budget** (from `files`), Sentry — each OK / Degraded / **Unknown**. **Audit logs:** filterable, immutable, actor, action, target, redacted before/after, IP hash, UA, timestamp.

---

## 17. Railway deployment (staging & production)

### 17.1 Topology

```
Railway project "fitcoach"
├── environment: staging
│   ├── web        Next.js standalone (public domain)
│   ├── api        NestJS (private; public domain only for webhooks/health)
│   ├── Postgres   Railway database service (volume; backups enabled)
│   └── db-backup  cron: pg_dump → R2 private bucket (daily)
└── environment: production   (same services, custom domains: app.<domain>, api.<domain>)
(optional) PR environments: own Postgres, migrated + seeded; share the staging R2 buckets under a pr-<n>/ key prefix

Cloudflare account (outside Railway)
├── R2 fitcoach-prod-private      presigned access only
├── R2 fitcoach-prod-public       custom domain media.<domain> (CDN)
├── R2 fitcoach-staging-private
└── R2 fitcoach-staging-public    r2.dev URL acceptable for staging
```
- Keep **App Sleeping/serverless off** for `web` and `api` in production (pg-boss schedules live in the API).
- All services in one region. Services must **listen on `::`** (IPv4+IPv6) so private networking works: API `app.listen(port, '::')`, web `HOSTNAME=::`.
- Stateless replicas: sessions/limits/jobs in Postgres, files in R2, nothing on container disks.

### 17.2 Builds (monorepo, Docker)
Each app has its own Dockerfile, built from the **repo root context** using `turbo prune --scope=<app> --docker` for small, cache-friendly layers. Per-service config file path: `apps/web/railway.json`, `apps/api/railway.json`, `infra/db-backup/railway.json`. Use `watchPatterns` so a web-only change doesn't redeploy the API.

`apps/api/Dockerfile` (sketch):
```dockerfile
FROM node:22-bookworm-slim AS base
RUN corepack enable
FROM base AS prune
WORKDIR /repo
COPY . .
RUN pnpm dlx turbo prune @fitcoach/api --docker
FROM base AS build
WORKDIR /repo
COPY --from=prune /repo/out/json/ ./
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ ./
RUN pnpm turbo run build --filter=@fitcoach/api && pnpm --filter @fitcoach/api deploy --prod /app
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
USER node
CMD ["node", "dist/main.js"]
```
`apps/web/Dockerfile`: same prune pattern → `next build` (`output: "standalone"`, `outputFileTracingRoot` = repo root) → copy `.next/standalone`, `.next/static`, `public` → `CMD ["node", "apps/web/server.js"]` with `HOSTNAME=::`. Declare `ARG` for every `NEXT_PUBLIC_*` (inlined at build).

`apps/api/railway.json`:
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "DOCKERFILE", "dockerfilePath": "apps/api/Dockerfile",
             "watchPatterns": ["apps/api/**", "packages/**", "pnpm-lock.yaml"] },
  "deploy": {
    "preDeployCommand": ["node dist/db/migrate.js"],
    "healthcheckPath": "/v1/health",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```
`apps/web/railway.json`: Dockerfile `apps/web/Dockerfile`, watch `apps/web/**`, `packages/**`; healthcheck `/healthz`.
`infra/db-backup/railway.json`: small image with `postgresql-client` + a Node upload script (AWS SDK pointed at R2); `cronSchedule: "30 20 * * *"` (UTC = 02:00 IST); `restartPolicyType: "NEVER"`; script runs `pg_dump -Fc` (compressed), uploads to the **private R2 bucket** at `backups/daily/YYYY-MM-DD.dump` (and `backups/weekly/` on Sundays), deletes dailies > 7 days and weeklies > 4 weeks (plus R2 lifecycle rules as a safety net), then POSTs a heartbeat with dump size to the API.

### 17.3 Environment variables (use Railway reference variables, e.g. `${{Postgres.PGHOST}}`, `${{api.RAILWAY_PRIVATE_DOMAIN}}`)

| Variable | Service | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | web (build+run) | public web URL |
| `NEXT_PUBLIC_APP_ENV` | web (build+run) | `staging`/`production` (staging ribbon) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | web (build) | optional |
| `API_INTERNAL_URL` | web | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` |
| `HOSTNAME` | web | `::` |
| `APP_ENV` | api | `development`/`staging`/`production` |
| `PORT` | api | set explicitly (e.g. `4000`) so the web reference resolves; web uses Railway-injected `PORT` |
| `WEB_ORIGIN` | api | exact web origin for CSRF/redirect checks |
| `DATABASE_URL` | api | `fitcoach_app` role over private network |
| `DATABASE_SYSTEM_URL` | api | `fitcoach_system` role |
| `DATABASE_OWNER_URL` | api (pre-deploy only usage) | `${{Postgres.DATABASE_URL}}` (admin) — used only by `migrate.js` |
| `DB_APP_PASSWORD` / `DB_SYSTEM_PASSWORD` | api | used by role bootstrap; shared variables |
| `DB_POOL_MAX` | api | e.g. `10` per replica (stay well under Postgres `max_connections`) |
| `SESSION_SECRET` / `APP_ENCRYPTION_KEY` / `IP_HASH_SALT` | api | 32+ random bytes each |
| `STORAGE_ENDPOINT` | api, db-backup | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (local: `http://localhost:9000`) |
| `STORAGE_REGION` | api, db-backup | `auto` (local: `us-east-1`) |
| `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` | api, db-backup | R2 API token scoped to **this environment's two buckets**, Object Read & Write |
| `STORAGE_PRIVATE_BUCKET` / `STORAGE_PUBLIC_BUCKET` | api (+ private for db-backup) | e.g. `fitcoach-prod-private` / `fitcoach-prod-public` |
| `STORAGE_PUBLIC_BASE_URL` | api | `https://media.<domain>` (staging: r2.dev URL; local: MinIO URL) |
| `STORAGE_KEY_PREFIX` | api | empty, or `pr-<n>/` for PR environments |
| `STORAGE_BUDGET_BYTES` | api | soft budget across both buckets, default `8589934592` (8 GiB) |
| `STORAGE_HARD_LIMIT_BYTES` | api | default `9663676416` (9 GiB) — uploads refused above this |
| `EMAIL_PROVIDER` / `SMTP_URL` / `RESEND_API_KEY` / `EMAIL_FROM` | api | `console` forbidden when `APP_ENV=production` |
| `SIGNUP_MODE` | api | `invite_code` (beta default) · `approval` · `open` |
| `BETA_DEFAULT_CLIENT_LIMIT` | api | active-client limit for new beta workspaces, e.g. `50` |
| `BILLING_PROVIDER` / `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | api | **v1.1** — leave unset in MVP |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | api | **v1.1** — leave unset in MVP |
| `TURNSTILE_SECRET_KEY` | api | optional |
| `SENTRY_DSN` | api, web | optional |
| `BACKUP_HEARTBEAT_TOKEN` | api, db-backup | shared |
| `LOG_LEVEL` | all | `info` |

`.env.example` (names only) at the root and per app. Changing `NEXT_PUBLIC_*` requires a web rebuild.

### 17.4 Deploy flow
1. **PR:** GitHub Actions — install → typecheck → lint → unit → API integration + RLS tests (Testcontainers) → build both apps → Playwright against a compose stack. Optional Railway PR environment.
2. **Merge to `main`:** Railway auto-deploys **staging** (enable "wait for CI"/check suites so it deploys only on green). API `preDeployCommand` runs role bootstrap + migrations; if it fails, the deploy stops and the old version keeps serving. GitHub job then runs smoke tests (`/v1/health/ready` + short Playwright suite) against staging.
3. **Production:** production environment tracks a `production` branch (fast-forward from `main` after staging smoke passes, with GitHub environment approval) → same pre-deploy migrations → smoke tests.
Migrations stay backward-compatible with the running release so rollbacks (redeploy previous deployment) are safe; contract steps ship one release later.

### 17.5 Health, logs, backups, rollback
- `GET /v1/health` (no DB) for Railway deploy health checks; `GET /v1/health/ready` (DB, pg-boss, R2 `HeadBucket`) for smoke tests and Platform Health. Web `/healthz`.
- Logs: pino JSON with `request_id` propagated web → API; never log tokens, emails, phones, health data or raw IPs.
- **Postgres backups:** enable scheduled **volume backups** (daily + weekly) on the Postgres service, and Point-in-Time Recovery on production if your plan supports it; plus the nightly logical `pg_dump` into R2 (off-platform, so it survives a volume wipe — wiping a Railway volume deletes its volume backups). R2 objects are not versioned by default: never delete files synchronously on user action — soft-delete in `files` and purge after 7 days via a job. Document and rehearse the restore in `docs/runbooks/restore.md` (DB restore + verifying that `files` rows still resolve to R2 objects).
- Rollback: redeploy the previous deployment in Railway.
- Set usage limits/alerts on the Railway project.

### 17.6 Troubleshooting (also in `docs/deployment/railway.md`)
Web can't reach API → API not listening on `::`, wrong `API_INTERNAL_URL`/`PORT`, or calling it during build. Login loop → cookie not set because the browser hit the API domain directly, `Secure` cookie over http locally, or `WEB_ORIGIN` mismatch. 403 on mutations → missing `X-FitCoach-Request` header or Origin mismatch. Migrations fail in pre-deploy → owner URL/role bootstrap; check deploy logs. Empty pages after deploy → `NEXT_PUBLIC_*` missing at build (declare `ARG`). Uploads fail → R2 endpoint/token scope, bucket names per environment, MIME/size limits, storage hard limit reached, or AWS SDK checksum headers (set `requestChecksumCalculation`/`responseChecksumValidation` to `"WHEN_REQUIRED"`). Public images 404/429 → custom domain not connected (`r2.dev` is rate-limited and for testing only) or wrong `STORAGE_PUBLIC_BASE_URL`. Jobs not running → API sleeping, pg-boss schema not migrated, or no API replica up. Webhook 401 → body parsed before verification or wrong per-environment secret.

### 17.7 Cloudflare R2 setup & free-tier budget

**Free tier (per Cloudflare account, shared by all buckets and environments):** 10 GB-month Standard storage, 1 M Class A ops (writes/lists), 10 M Class B ops (reads), egress free. Usage above it is billed, so the app enforces its own budget.

Setup checklist (document in `docs/deployment/r2.md`):
1. Enable R2 in the Cloudflare dashboard (activation may ask for a payment method even when you stay in the free tier). Note the Account ID.
2. Create the four buckets (§17.1) in Standard storage class (Infrequent Access has no free tier). Choose a location hint near India/Asia-Pacific.
3. Public buckets: connect a **custom domain** (`media.<domain>`, domain on Cloudflare) for production — `r2.dev` URLs are rate-limited and meant for testing. Keep `r2.dev` **disabled** on private buckets. Cache rule: cache everything, long TTL; object keys are immutable (`{uuid}.webp`), so no purges are needed.
4. Create one **R2 API token per environment** (Object Read & Write, restricted to that environment's buckets). Put credentials only in Railway variables.
5. **CORS** not required (uploads go through the API). If direct browser uploads are ever added, restrict CORS to `WEB_ORIGIN` and `PUT`.
6. **Lifecycle rules** on private buckets: `exports/` delete after 1 day, `backups/daily/` after 8 days, `backups/weekly/` after 35 days, abort incomplete multipart uploads after 1 day.

Keeping inside 10 GB:
- Store only processed images: WebP, max 1600 px (≈150–400 KB) + 400 px thumbnail (≈20–40 KB). Never keep originals.
- Avatars 512 px, public-page images 1600 px, exercise media prefer licensed external video links over uploads.
- `files.size_bytes` is the usage ledger: `StorageService.usage()` sums it (cached 5 min). At `STORAGE_BUDGET_BYTES` (default 8 GiB) the Platform Health page turns **Degraded** and platform owners get a notification; at `STORAGE_HARD_LIMIT_BYTES` (9 GiB) new uploads are refused with a clear message (no silent failure). A weekly job reconciles the ledger against R2 listings (counts as Class A — keep it weekly).
- (v1.1, with photos) per-plan entitlement `max_progress_photos_per_client` (e.g. Trial 10, Solo 50, Pro 200). Soft-deleted files are purged after 7 days.
- Staging shares the same 10 GB: seed only a handful of small images there and clean `pr-*` prefixes when PR environments close.
- Read ops: thumbnails in lists, full images on demand; presigned URLs reused per page render (≤ 5 min) so the browser cache helps; public images are served by the CDN cache rather than repeated R2 reads.

Note: uploads from Railway to R2 travel over the public internet and count toward Railway egress (small at these image sizes).

---

## 18. Local development (Docker Desktop)

`docker-compose.yml` (default profile):
- `postgres` — `postgres:<same major as Railway>` on `5432`, volume `pgdata`, healthcheck `pg_isready`.
- `mailpit` — SMTP `1025`, UI `http://localhost:8025`.
- `minio` — S3 API `9000`, console `9001`; `minio-init` creates `fitcoach-local-private` and `fitcoach-local-public` (anonymous read on the public one to mimic the R2 custom domain). Same `StorageService` code path as R2 — only env values differ.
Profile `full`: also builds and runs `api` and `web` from their Dockerfiles for production-parity checks.

Workflow:
```bash
cp .env.example .env            # local values (pre-filled for compose services)
docker compose up -d            # Postgres, Mailpit, MinIO
pnpm install
pnpm db:migrate                 # bootstrap roles + migrations + pg-boss schema
pnpm db:seed                    # demo trainer/client + exercise library
pnpm dev                        # turbo: web :3000, api :4000 (API_INTERNAL_URL=http://localhost:4000)
```
Demo logins printed by the seed. Emails appear in Mailpit; files in MinIO. `pnpm db:reset` drops and rebuilds the local DB. Local cookies: `Secure` off when `APP_ENV=development`.

---

## 19. Testing & quality gates

**Unit (Vitest):** Zod schemas, phone normalization, duplicate matching, metrics, unit conversion, timezone helpers, entitlements, webhook signature verification, token hashing, rate-limit maths.
**DB / RLS (Testcontainers Postgres, real migrations):** connect as `fitcoach_app` with `set_config` contexts and prove — trainer A can't read/write B; client sees only own permitted rows/views; empty context sees nothing; every `public` table has RLS (except allow-list); exclusion constraint; check-in uniqueness; measurements append-only; audit logs insert-only.
**API integration (Nest testing module + Supertest + Testcontainers):** auth flows (signup with beta code, verify, login, reset, client invite link accept/expire/reuse, client OTP, platform MFA, session revoke), **packages** (attendance deducts once even on double-submit, no-show/late-cancel policy, reversal on un-marking, renewal closes the old package, payments and amount due, client sees sessions left but not prices), **recurring series** (expansion, conflict listing, edit this/following), lead create + duplicate prompt, follow-up lifecycle, trial conflict, conversion success + forced-failure rollback + concurrent double-submit = one client, onboarding finalize, set idempotency, invite acceptance, suspension read-only, message template rendering (placeholders, encoding), URL/ID tampering → 403/404.
**E2E (Playwright, mobile + desktop):** the full MVP Definition-of-Done journey (§21), client journey (invite link → check-in → log workout → see sessions left), platform-owner journey (TOTP → approve trainer → assign plan → suspend), access-tampering attempts; axe checks on key pages.
**Gates before "done":** typecheck, lint, unit, DB/RLS, API integration, critical E2E, both production builds, migrations from zero, `docker compose --profile full up` boots, staging on Railway healthy, smoke tests green, no broken links, no known critical security defects.

---

## 20. Implementation plan — MVP (vertical slices: UI + API + DB + RLS + tests)

The exact prompts for each step are in **`PHASES.md`** (one Claude Code session per step).

| Phase | Steps | Exit criteria |
|---|---|---|
| **0 · Plan** | Inspect repo, `docs/architecture.md`, ADRs for D1–D25 | Plan written; continue |
| **1 · Foundation** | Monorepo + Docker compose → API skeleton + DB roles + RLS harness → auth (trainer signup with beta code, verify, login, sessions) → web shells + design tokens + `/api` proxy + typed client → storage (MinIO/R2) + files ledger → Dockerfiles + CI + **first Railway staging deploy** | Trainer can sign up and log in on Railway staging; RLS tests green |
| **2 · Growth spine** | Settings basics + public page + enquiry → leads list + drawer + duplicates → follow-ups + communication log + message templates → calendar (day/week/agenda) + recurring series + trials + attendance → conversion → onboarding wizard | Enquiry → lead → follow-up → trial → client works end-to-end |
| **3 · Coaching & packages** | Clients list/detail + lifecycle → **packages, ledger, payments** → exercise library seed + starter templates → program builder → assignment + planned sessions → live workout logging | Trainer can sell a package, run a session, log a workout; sessions left update |
| **4 · Client app & results** | WhatsApp invite link + client login/OTP → client home/workouts/schedule/contact/profile → check-ins (client form + trainer inbox) → measurements + charts + sharing | Invited client checks in, logs a workout, sees shared progress and sessions left |
| **5 · Dashboard & beta readiness** | Dashboard + attention groups + first-run checklist → notifications + pg-boss jobs → product events + feedback → CSV export → PWA install → legal pages + beta FAQ | Alpha with 1 trainer for a week with no data/access bugs |
| **6 · Platform & production** | Platform owner (MFA, overview, trainers, approve/assign/suspend, invites, feedback, health, audit) → db-backup service → production Railway + R2 + domains → launch checklist + restore drill | Closed beta opens to 5–10 trainers |

**v1.1 backlog (after beta feedback, in rough priority):** Razorpay subscriptions + billing page + plans editor · progress photos · Kanban · month view + availability · email/web-push reminders · scoped check-in links · trainer MFA + Google sign-in · support tickets · global search · payment receipts · tempo/progression · data-deletion automation.
**Later:** nutrition, chat, WhatsApp API, group sessions, self-serve booking, Studio, offline queue, analytics/announcements.

Each slice ends with tests green, staging deployed, `CHANGELOG.md` entry.

---

## 21. Definition of Done — MVP (closed beta)

On **Railway staging**, without manual database edits, a trainer can:
1. Sign up with a beta code, verify email, sign in (and again later without losing data).
2. Follow the first-run checklist from an empty workspace.
3. Publish and share the public enquiry page (URL + QR).
4. Receive an enquiry as a lead (attribution + consent stored) and get an in-app notification.
5. Review the lead, contact them via WhatsApp from a template, and log the contact.
6. Schedule a follow-up and see it due/overdue on the dashboard.
7. Book a trial with conflict protection and record attendance.
8. Convert the prospect into exactly one client, selling a package in the same flow (idempotent; history preserved).
9. Complete onboarding (drafts resumable; optional fields optional).
10. Create a recurring weekly series of sessions without conflicts.
11. Assign a program created from a starter template.
12. Run a session: log a workout set-by-set (refresh-safe) and mark attendance → **sessions left decrease exactly once**.
13. Record a manual payment and see the amount due update; see payment-due and package-expiring items on the dashboard with a WhatsApp reminder.
14. Invite the client via a WhatsApp link.
15. Receive the client's check-in and mark it reviewed.
16. Add measurements, view historical charts, and choose what the client can see.
17. Export their data as CSV; send feedback.
18. Use everything on mobile and desktop; install the PWA.
19. Rely on role, tenant and ownership restrictions (proven by tests).

An invited client (via WhatsApp link, re-login via email OTP) can: see today's workout and next session, see sessions left, log a workout (if enabled), submit a check-in, view shared progress and own schedule, and contact the trainer — and nothing else.
A platform owner (with MFA) can: see real counts, approve trainers, assign plans/limits, suspend/reactivate (audited), manage beta invites, read feedback, check health and storage, and read audit logs. Trainers and clients can't reach platform admin by editing URLs or client state.
Production is provisioned on Railway (web, api, Postgres with backups, db-backup) with Cloudflare R2 (private + public buckets, custom media domain, scoped token, lifecycle rules), secrets set, migrations applied, legal pages live, smoke tests green, restore drill done once.

---

## 22. Operating instructions for the coding agent

1. Inspect the repository first; extend what works rather than replacing it.
2. Summarize architecture and gaps, write a concise plan, then **keep implementing**.
3. Build in phase order as vertical slices.
4. Real persistence and authorization only — never disable RLS, use the system DB role, or skip guards to make a demo work.
5. No fictional metrics, fake success responses, placeholder buttons that pretend to work, or dead-end links; unfinished = hidden or disabled "Coming soon".
6. Missing secret/integration → boundary + local adapter + honest "not configured" state + documented setup.
7. Verify each workflow with tests; fix build errors and regressions before moving on.
8. Keep `docs/` current: architecture, decisions, rls, metrics, api, local-development, deployment/railway, runbooks.
9. If scope must shrink, protect the spine in §0.
10. **Build only MVP items (§1A).** Don't scaffold v1.1/Later features, routes, nav items or tables. If an MVP feature seems to need one, record an ADR and choose the smallest MVP-compatible option.

**Final objective:** a cohesive, premium, secure, beta-ready FitCoach — Next.js + NestJS + PostgreSQL on Railway, developed locally on Docker Desktop. It should look like a world-class fitness SaaS, and every workflow underneath must be real, maintainable and testable.
