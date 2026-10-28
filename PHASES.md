# FitCoach MVP — Build Phases & Claude Code Prompts

Copy-paste prompts for building the FitCoach MVP (closed beta) with Claude Code, in order.
Spec: `PROMPT.md` (MVP Edition) · Rules: `CLAUDE.md` · Why: `MVP_REVIEW.md`.

**7 phases · 28 steps.** Expect 1–3 extra fix-up prompts per phase.

---

## How to run each step

1. Start a **fresh Claude Code session** for each step (CLAUDE.md and PROMPT.md carry the context).
2. Paste the step's prompt as-is.
3. When Claude finishes, check the **Done when** list yourself — on your phone and desktop, not just the test output.
4. Commit (or merge the PR). If something's wrong, use the fix-up prompt at the end of this file in the same session.
5. Update the checkbox below.

Every prompt ends with the same quality bar, so you don't need to repeat it:
> *Stay inside PROMPT §1A MVP scope. Follow CLAUDE.md. Include migration + RLS policies + RLS tests, API guards + integration tests (including one tampering case), shared Zod schemas, all UI states (loading/empty/error/permission-denied) on mobile and desktop, and a Playwright test for the user path. Run `pnpm verify` and fix everything before finishing. Update docs and CHANGELOG.md. Summarize what you built and anything I need to set up manually.*

That paragraph is referred to below as **[QUALITY BAR]** — paste it at the end of each prompt.

For steps with screens, Claude Code also opens the board rows that `docs/design/README.md` lists for that step. CLAUDE.md tells it to, so you don't need to repeat it in the prompt.

---

## Progress

- [x] 0.1 Plan
- [x] 1.1 Monorepo + Docker · [x] 1.2 API + DB roles + RLS · [x] 1.3 Auth · [x] 1.4 Web shells · [x] 1.5 Storage · [x] 1.6 Railway staging
- [x] 2.1 Settings + public page · [x] 2.2 Leads · [x] 2.3 Follow-ups + templates · [x] 2.4 Conversion · [x] 2.5 Onboarding · [x] 2.6 Calendar
- [x] 3.1 Clients · [x] 3.2 Packages · [x] 3.3 Exercises + templates · [x] 3.4 Programs · [x] 3.5 Live workout
- [x] 4.1 Client invite + login · [x] 4.2 Client app · [x] 4.3 Check-ins · [x] 4.4 Progress
- [ ] 5.1 Dashboard · [ ] 5.2 Notifications + jobs · [ ] 5.3 Beta readiness
- [ ] 6.1 Platform owner · [ ] 6.2 Backups + production · [ ] 6.3 Launch checklist

---

## Before you start (one-time, ~1 hour)

- Install Docker Desktop, Node 24 LTS, pnpm, Git, and Claude Code. Create an empty GitHub repo.
- Unzip the FitCoach pack into the empty repo, so `CLAUDE.md`, `PROMPT.md`, `PHASES.md`, `MVP_REVIEW.md`, `README.md` and `docs/` sit at the root, then commit. The reference boards and their screen index are already in `docs/design/`.
- Create a Railway account and an empty project `fitcoach` (environments `staging` and `production`).
- Create a Cloudflare account, enable R2, and create the four buckets from PROMPT §17.7. Buy your domain and add it to Cloudflare (needed for `media.<domain>` and email).
- Pick an email provider (Resend or any SMTP) for staging/production. Locally, Mailpit is used.

---

## Phase 0 — Plan

### 0.1 Read and plan
```
Read CLAUDE.md, PROMPT.md, MVP_REVIEW.md, docs/design/README.md and the four boards in docs/design/ completely. Don't write app code yet.
1. Write docs/architecture.md: the target architecture (monorepo, web, api, Postgres roles, RLS, R2, Railway), module list, and how the MVP scope in PROMPT §1A maps to modules.
2. Write one short ADR per decision D1–D25 in docs/decisions/ (title, decision, why, consequences).
3. Write docs/mvp-plan.md mapping each step of PHASES.md to the PROMPT sections it implements, with any risks or open questions.
Then stop and summarize the open questions for me.
```
**Done when:** the three docs exist and the open questions make sense to you. Answer them before step 1.1.

---

## Phase 1 — Foundation

### 1.1 Monorepo + local Docker
```
Implement PROMPT §4.1 and §18: pnpm workspaces + Turborepo with apps/web (Next.js ≥16, App Router, TypeScript strict, Tailwind, shadcn/ui), apps/api (NestJS, TypeScript strict), packages/shared, packages/api-client, packages/config. Pin Node 24 LTS (engines, .nvmrc, CI, Docker images — ADR-0026). Add docker-compose.yml with Postgres 17 (until Railway's version is confirmed — ADR-0027), Mailpit and RustFS with both local buckets (§18). Add .env.example files, root scripts from the CLAUDE.md Commands table (stubs are fine where the feature doesn't exist yet, but they must exit cleanly), ESLint/Prettier, Vitest in both apps, Playwright skeleton, and a GitHub Actions CI workflow running typecheck, lint and unit tests.
[QUALITY BAR]
```
**Done when:** `docker compose up -d && pnpm install && pnpm dev` starts web on :3000 and api on :4000; CI is green.

### 1.2 API skeleton, database roles, RLS harness
```
Implement PROMPT §4.3, §4.5, §10.1, §10.5, §10.6 and §12.1 foundations in apps/api: ConfigModule with Zod env validation, nestjs-pino with request_id, helmet, CSRF checks (§12.2), the error filter and error contract, nestjs-cls, the DbContext interceptor with set_config('app.*', …, true), Drizzle setup, SystemDb.run(reason, fn), the idempotent role bootstrap (fitcoach_app, fitcoach_system), the migrate script (roles + SQL migrations + pg-boss schema), app.current_*() SQL helpers, the rate-limit table + function, idempotency_keys, audit_logs, health endpoints (/v1/health, /v1/health/ready). Add the Testcontainers DB test harness and the CI test that fails when any public table lacks RLS. No business features yet.
[QUALITY BAR]
```
**Done when:** `pnpm db:migrate` and `pnpm test:db` pass locally; `/v1/health/ready` reports DB OK.

### 1.3 Authentication
```
Implement PROMPT §4.4 and §12.2 for trainers and the auth base for clients: users, sessions, auth_tokens, profiles, workspaces, workspace_members, trainer_settings, workspace_plans (beta plan seeded), beta_invites. Endpoints: signup (3-step data: account → profile → business; requires a beta invite code when SIGNUP_MODE=invite_code), verify email, login, logout, me, forgot/reset password, active sessions list + revoke. argon2id, opaque hashed session cookie fc_session, constant-time non-enumerating responses, Postgres rate limits. Email via the EmailProvider abstraction (SMTP → Mailpit locally; console adapter non-prod only). Guards: SessionGuard, RolesGuard, WorkspaceGuard, @Public(). On signup, copy default message templates and package presets into the new workspace (create those two tables now with defaults from §8.12 and §8.3A). Add `pnpm platform:grant` CLI (platform_roles) but no platform UI yet. Add an audited `pnpm beta:invite` CLI (create with uses/expiry, list, revoke) so beta codes exist before step 6.1 (ADR-0029). Signup step 3 "Business" collects business/display name, public page slug (prefilled, unique), city, coaching modes and timezone (default Asia/Kolkata); phone optional (ADR-0032). New workspaces get the beta plan with BETA_DEFAULT_CLIENT_LIMIT (default 50, ADR-0033). Create product_events and a small no-PII track() helper now and record trainer_signed_up and email_verified (ADR-0030).
[QUALITY BAR]
```
**Done when:** you can sign up with a beta code, receive the verification email in Mailpit, log in, see sessions, and log out; a second trainer can't access the first trainer's data in tests.

### 1.4 Web shells + design system + API proxy
```
Implement PROMPT §6, §7 and §4.2 in apps/web: design tokens (§7.1) as CSS variables + Tailwind theme, Inter, shared components from §7.2 (start with AppShell, sidebar, BottomNav, PageHeader, KpiCard, DataTable↔CardList, FilterBar, StatusPill, Drawer, Stepper, EmptyState, ErrorState, PermissionDenied, ConfirmDialog, Toast, OfflineBanner, NotConfiguredNotice), the trainer/client/platform layouts with MVP navigation only (§6), app/api/[...path] streaming proxy, lib/api/server.ts and browser.ts using packages/api-client (generated from the API's OpenAPI), proxy.ts coarse redirects, and the public pages: signup (3 steps, matching the "Trainer Sign Up" mockup), login, forgot/reset, verify-email. Match the reference images in docs/design/ for layout and feel, but follow §7.3 (no brand logos, fake numbers or reviews). Draw an original SVG logo mark + "FITCOACH" wordmark in the lime/charcoal tokens; use gradients/illustrations instead of people photos (ADR-0034).
[QUALITY BAR]
```
**Done when:** signup/login work through the browser on mobile and desktop; the trainer shell shows only MVP nav items; navigating to /platform as a trainer is refused by the API.

### 1.5 File storage (RustFS / R2)
```
Implement PROMPT D11, §11 storage row, §17.7 and the files ledger (§10.2): StorageService with private and public buckets (put, presignGet ≤ 5 min, publicUrl, delete, usage), the R2 S3 client settings from CLAUDE.md, upload endpoint through the API with type/size checks and sharp (EXIF strip, WebP 1600 px + 400 px thumbnail), files table as the storage ledger, soft delete + 7-day purge job stub, budget/hard-limit checks with clear errors. First use: trainer profile photo and public-page photo (public bucket), client avatar (private bucket, used later). Local uses RustFS; staging will use R2.
[QUALITY BAR]
```
**Done when:** you can upload a profile photo locally, see it in RustFS as WebP, and an over-limit upload is refused with a readable message.

### 1.6 Dockerfiles, Railway staging, CI deploy
```
Implement PROMPT §17.1–§17.6 for the staging environment: apps/api/Dockerfile and apps/web/Dockerfile using turbo prune, standalone Next.js with HOSTNAME=::, API listening on '::' and an explicit PORT, apps/api/railway.json (preDeployCommand runs migrate, healthcheck /v1/health), apps/web/railway.json (healthcheck /healthz), watchPatterns, docker compose --profile full for local parity, GitHub Actions: PR checks (incl. Testcontainers tests and Playwright against the compose stack) and post-deploy smoke tests against staging. Write docs/deployment/railway.md and docs/deployment/r2.md with step-by-step setup for me, including every variable from §17.3 and which Railway reference variables to use.
Then give me a numbered checklist of exactly what I must click/configure in Railway and Cloudflare myself.
[QUALITY BAR]
```
**Done when:** after you follow the checklist, staging web + api + Postgres are live on Railway, signup/login work there, and a profile photo lands in the staging R2 bucket.

---

## Phase 2 — Growth spine

### 2.1 Settings basics + public enquiry page
```
Implement PROMPT §8.12 (profile & public page, units & locale, message templates editor, package presets, check-in & attention rules, security, plan read-only) and the public enquiry page + share screen from §8.2: /coach/[slug] (matching the "Public Enquiry Page" mockup), consent text version, honeypot, time-to-submit, Postgres rate limit, optional Turnstile, POST /public/enquiries under SystemDb inserting lead + consent + activity + notification, share screen with URL, QR (PNG/SVG download), Web Share and per-source links. Create only the tables these need (leads, lead_activities, lead_consents, lead_forms, trainer_public_pages, notifications).
[QUALITY BAR]
```
**Done when:** you publish your page, submit an enquiry from your phone in a private window, and the lead exists with source + consent; spamming the form gets rate-limited.

### 2.2 Leads list + drawer
```
Implement PROMPT §8.2 leads list (List view only — no Kanban), KPI cards, stage tabs with counts, search (pg_trgm), filters, sort, cursor pagination, CSV export, Add Lead form with E.164 normalization and duplicate detection across leads and clients, the lead drawer (Overview with inline edit, Activity timeline, private Notes; right drawer on desktop, full screen on mobile), stage changes with lead_activities, mark lost. Match the Leads mockups (desktop table, drawer, mobile list, Add New Lead).
[QUALITY BAR]
```
**Done when:** you can add, search, filter, edit and change stage of leads on mobile and desktop; a duplicate phone number shows the "Possible match" panel.

### 2.3 Follow-ups, communication log, WhatsApp templates
```
Implement PROMPT §8.2 follow-ups (create from drawer and list, due/overdue states, complete with outcome + offer next follow-up, in-app reminder preference only), communication_logs with the "Log contact" form (§8.10), last_contact_at maintenance, and the WhatsAppLinkBuilder (§11, CLAUDE.md rule 20d) rendering workspace message templates with placeholders and URL encoding. WhatsApp buttons in the lead list and drawer open click-to-chat prefilled from the follow_up template and ask "Did you send it?" before logging.
[QUALITY BAR]
```
**Done when:** a follow-up shows as Today/Overdue, WhatsApp opens on your phone with the right prefilled text, and the contact appears in the Activity timeline.

> Step order changed in step 0.1 (ADR-0028): conversion and onboarding come **before** the calendar, because recurring series and client sessions need the `clients` table.

### 2.4 Lead → client conversion
```
Implement PROMPT §8.2 "Lead → client conversion" exactly: POST /leads/:id/convert with Idempotency-Key, single transaction, SELECT … FOR UPDATE, link-to-existing-client option, active-client limit from workspace_plans (PLAN_LIMIT error), client creation with attribution and source_lead_id, lead updates + activities + activity_events. Create the clients table (§10.2, §10.3 uniques) with RLS, and extend the step 2.2 duplicate check to include clients. UI: the "Convert to Client" confirm sheet from the mockup. Leave the "initial package" field visible but disabled with "Available after packages are set up" until step 3.2, and wire "Convert & Continue" to open the onboarding wizard route (built next).
Include a concurrency test proving double-submit creates exactly one client and a forced-failure test proving the lead is not marked converted.
[QUALITY BAR]
```
**Done when:** converting a lead twice quickly still gives one client; the lead's history is preserved.

### 2.5 Onboarding wizard
```
Implement PROMPT §8.4: the 4-step wizard (Basic info → Goals & training → Baseline & consent → Review & create) with Save as Draft on every step (client_onboarding_drafts), ?draft= and ?fromLead= prefill, optional baseline measurements (create measurement_types + measurements tables now, append-only), consents with notice version/timestamp/source/actor (client_consents), client_goals, finalize in one transaction. Match the Add New Client mockups. Optional fields never block creation. In Review & create, show the optional package and program fields disabled with honest copy until steps 3.2 and 3.4.
[QUALITY BAR]
```
**Done when:** you can start a client, leave halfway, come back to the draft, and create the client with only the required fields.

### 2.6 Calendar, recurring series, trials, attendance
```
Implement PROMPT §8.6 and §10.3 scheduling: appointments with the exclusion constraint (ends_at maintained by a trigger — a generated column can't use timestamptz + interval because it isn't immutable), appointment_changes, appointment_series for clients with expansion (≤ 52 occurrences) and per-occurrence conflict reporting, edit this / this-and-following, reschedule, cancel with reason and late-cancel flag (D25 window from settings), mark attendance (completed / no-show), session notes, day + week views on desktop, agenda + day on mobile, trial booking from the lead drawer (Book Trial Session mockup) moving the lead to trial_booked. Package deduction is NOT built yet — leave a clearly named service hook that step 3.2 will implement.
[QUALITY BAR]
```
**Done when:** you can book a trial, create a Mon/Wed/Fri series for 8 weeks for a client, see a conflict when you double-book, and mark attendance.

---

## Phase 3 — Coaching & packages

### 3.1 Clients list + detail
```
Implement PROMPT §8.3 clients list (Active/Paused/Archived tabs with counts, search, filters, sort, mobile cards) and client detail shell with tabs Overview · Packages · Workouts · Schedule · Check-ins · Progress · Notes (tabs for later steps show a proper empty state explaining what will appear there — no fake data). Overview: goal, weeks with you, next appointment, recent activity, quick actions. Lifecycle: pause, archive (revokes client sessions), restore. Private client_notes. Match the Clients and Client Profile mockups.
[QUALITY BAR]
```
**Done when:** clients appear in the right tabs; archiving and restoring keeps all history.

### 3.2 Packages, sessions remaining, payments
```
Implement PROMPT §8.3A completely, plus the D25 policy: client_packages, package_presets usage, package_session_ledger, client_payments (append-only, voids), one-active-package rule, renewal, expiry, sell-package sheet (from client detail, conversion and onboarding — enable the fields left disabled in steps 2.4 and 2.5), Packages tab with "8 of 12 used" progress, payments list and "Record payment", amount due, and the attendance hook from step 2.6 now writing ledger rows in the same transaction (attended / no-show / late cancel per policy; reversal on un-marking; manual adjustment with note). Time-based and online packages never deduct sessions; "N per week" is shown on the package card but not enforced (ADR-0031). INR formatting with Indian grouping; money in paise.
Tests must prove: double-submitting attendance deducts once; un-marking reverses; renewal closes the old package; the client API never returns prices or payments.
[QUALITY BAR]
```
**Done when:** you sell a 12-session pack, mark 3 sessions attended and 1 no-show, record a partial payment, and the numbers are right everywhere.

### 3.3 Exercise library + starter templates
```
Implement PROMPT §8.5 exercise library and D21: a migration seeding ~100 common exercises (gym, dumbbell, bodyweight, band, mobility) with muscle groups, equipment, category, instructions and safety notes written generically (no copied text), plus custom exercises per workspace, filters and search (/app/exercises). Seed the 7 starter program templates listed in §8.5 as global read-only programs using only seeded exercises (the programs tables are created here; the builder UI comes in 3.4). No outcome claims in template descriptions.
[QUALITY BAR]
```
**Done when:** the library is searchable and filterable on your phone; you can add a custom exercise.

### 3.4 Program builder + assignment
```
Implement PROMPT §8.5 program builder and assignment: /app/programs list (mine + starter templates), "Start from template" (copy-to-edit), builder with weeks/day slots, workouts, ordered exercises (sets, reps or time, target load, rest, trainer notes, client-visible instructions), drag-to-reorder with keyboard alternative, duplicate. Assignment to a client with program_snapshot, start date, schedule, instructions, and generation of planned workout_sessions for a rolling window. Show the assigned program on the client detail Workouts tab.
[QUALITY BAR]
```
**Done when:** you build a program from a template in under 5 minutes and assign it; the client's upcoming workouts appear.

### 3.5 Live workout logging
```
Implement PROMPT §8.5 session tracking and live workout UI (match the "Live Workout" and "Upper Body Strength" mockups): planned → in_progress → completed | skipped, workout_session_exercises, workout_sets saved per set via PUT /workout-sets/:clientUuid (idempotent upsert), reps/weight steppers, rest timer, previous/next, progress bar, substitutions, trainer feedback, Finish Workout summary, refresh-safe restore, OfflineBanner disabling saves. When the workout belongs to an appointment, finishing offers "Mark attended" (which triggers package deduction from 3.2).
[QUALITY BAR]
```
**Done when:** you log a full workout on your phone at the gym, refresh mid-way without losing sets, and the session counts against the package once.

---

## Phase 4 — Client app & results

### 4.1 Client invite link + client login
```
Implement PROMPT D19, §8.3 portal access and §12.2 client auth: "Invite via WhatsApp" on client detail and at the end of onboarding (client_invite token, hashed, single use, 7-day expiry, regenerate revokes old ones), WhatsApp click-to-chat with the client_invite template, /invite/[token] welcome + accept terms → 60-day session → /client/home, invite status display, /client/login with 6-digit email OTP (rate-limited), email fallback for clients without a phone, ClientScopeGuard and client-portal views. Clients must not be able to reach /app or /platform or other clients' data.
[QUALITY BAR]
```
**Done when:** you invite a test client from your phone, open the link on a second phone, and land in the client app; reusing the link fails.

### 4.2 Client app screens
```
Implement PROMPT §9 client screens (match the client mobile mockups, applying the §7.3 mockup → MVP adjustments): Home (week strip, check-in prompt placeholder that step 4.3 will activate, today's workout, next session, Sessions left tile, shared-metric tiles), My Workouts (Upcoming/Past), Workout details, client workout logging reusing the 3.5 UI when self-logging is enabled (read-only otherwise), Schedule, Contact trainer card (WhatsApp/call), Profile (allow-listed fields), More menu. Per-client feature flags respected by UI and API.
[QUALITY BAR]
```
**Done when:** the client sees only their own workouts, schedule and sessions left — no prices, notes or other clients.

### 4.3 Check-ins
```
Implement PROMPT §8.7: client check-in form (match the "Daily Check-in" mockup; < 1 minute), one per client per local date with same-day edits recorded in check_in_revisions, confirmation screen, home check-in prompt when due (per client frequency), trainer inbox /app/check-ins (unreviewed first, filters, mark reviewed + reply note), client detail Check-ins tab with self-reported trends, and the trainer "Nudge" button using the check_in_nudge template.
[QUALITY BAR]
```
**Done when:** the client checks in from their phone, you see it in the inbox and mark it reviewed.

### 4.4 Measurements, charts, sharing
```
Implement PROMPT §8.8 (without photos): add/void measurements (append-only), measurement types incl. custom, trend charts with 1M/3M/6M/1Y/All, units, first vs latest + change, empty states; client detail Progress tab; /app/progress overview listing clients with recent changes (no cross-client averages); progress_shares per metric (default nothing shared); client Progress screen showing shared metrics only; optional client self-logging when enabled. Match the Progress/Measurements mockups.
[QUALITY BAR]
```
**Done when:** you add a few weights over different dates, share weight only, and the client sees weight but not waist.

---

## Phase 5 — Dashboard & beta readiness

### 5.1 Dashboard + first-run checklist
```
Implement PROMPT §8.1 fully: GET /dashboard/summary (no N+1), KPI cards incl. Payments due / packages expiring, today's schedule with Start/Join/View/attendance actions, Needs attention groups in the specified order with one-tap WhatsApp reminders for payments and packages, recent activity, and the first-run checklist computed from real data. Metric definitions in packages/shared/metrics.ts and docs/metrics.md, all in the workspace timezone. Match the trainer dashboard mockups (desktop and mobile).
[QUALITY BAR]
```
**Done when:** a brand-new workspace shows the checklist and zeros; your test workspace shows correct numbers you can verify by hand.

### 5.2 Notifications + background jobs
```
Implement PROMPT §8.10 in-app notifications (bell, unread count, mark read/all, client notices) and §13 MVP jobs with pg-boss: follow-up due/overdue, trials in 2 h, unmarked appointments, package expiry/low sessions/payment due (daily 07:00 workspace time), planned sessions window extension, token/OTP/rate-limit/idempotency/session purges, export generation, auth email queue with retries, weekly storage reconciliation. Idempotent with dedupe keys, graceful SIGTERM shutdown, job outcomes recorded for the health page.
[QUALITY BAR]
```
**Done when:** an overdue follow-up and an expiring package produce exactly one notification each, even after an API restart.

### 5.3 Beta readiness
```
Implement: product_events (PROMPT §10.2, §1A.5 — record the events needed for every beta metric, no PII), the "Send feedback" button (feedback table, page URL attached), CSV data export (§8.12, private bucket, 24 h presigned link), PWA install (§14: manifest, icons from the FitCoach logo mark, app shell service worker, offline page, iPhone Add-to-Home-Screen instructions), the /beta FAQ page listing known limitations (no group sessions, no chat, no self-booking, no photos yet, payments recorded manually), pricing page "Free during beta" + request access, and privacy/terms pages written factually from §12 (mark clearly that they need legal review before launch). Do an accessibility pass with axe on the main screens and fix issues.
[QUALITY BAR]
```
**Done when:** you can install the app on your phone's home screen, export your data, and send feedback.

**→ Alpha:** use FitCoach yourself (or with one friendly trainer) for a week on staging. Fix what hurts before Phase 6.

---

## Phase 6 — Platform & production

### 6.1 Platform owner (MVP)
```
Implement PROMPT §16.0 exactly (not §16.1): /platform/login with mandatory TOTP MFA setup and recovery codes, PlatformMfaGuard (AAL2), 12-hour sessions, Overview with real counts and the activation rate (no revenue cards), Trainers list/detail (counts only, no client PII), approve signup, assign plan / client limit / trial end (workspace_plans), suspend/reactivate with reason (workspace read-only, banner, export allowed), password-reset email, revoke sessions, beta invite codes, feedback inbox, health page (DB, jobs, backups heartbeat, email, R2, storage budget — OK/Degraded/Unknown), audit log viewer. Use SystemDb only for aggregates and audited admin actions. Match the Superadmin Dashboard mockup layout without the revenue widgets.
Tests: a trainer or client changing URLs or cookies can't reach any /platform endpoint; every admin action writes audit_logs.
[QUALITY BAR]
```
**Done when:** you grant yourself platform owner, log in with an authenticator app, approve a trainer, change their client limit and suspend/reactivate them — all visible in the audit log.

### 6.2 Backups + production environment
```
Implement PROMPT §17.2 db-backup service (infra/db-backup: pg_dump -Fc nightly to the private R2 bucket under backups/, retention, heartbeat to the API), the production environment setup docs, R2 production buckets with the media custom domain, lifecycle rules, scoped tokens, production-only config checks (console email forbidden, Secure cookies, no OpenAPI docs), and docs/runbooks/restore.md and docs/runbooks/data-deletion.md (with the audited CLI command). Then give me a numbered checklist for creating the production environment in Railway and Cloudflare, and for running a restore drill on staging.
[QUALITY BAR]
```
**Done when:** a backup file appears in R2 each night on staging, you've restored it once into a scratch database, and production is live on your domain.

### 6.3 Launch checklist
```
Review the whole app against PROMPT §21 (MVP Definition of Done) and CLAUDE.md. Run the full Playwright suite against staging on mobile and desktop viewports. Write docs/launch-checklist.md with every DoD item marked pass/fail with evidence, all remaining known issues ranked by severity, and the v1.1 backlog from §20. Fix every critical and high issue you find. Don't add new features.
[QUALITY BAR]
```
**Done when:** every DoD item passes on staging and production smoke tests are green.

**→ Closed beta:** invite 5–10 trainers with beta codes. Talk to each one weekly. Track the §1A.5 metrics from the platform overview.

---

## Fix-up prompts (use in the same session when needed)

**Something is broken**
```
This isn't working: <what you did> → <what happened> → <what you expected>. Screenshot/error: <paste>. Find the root cause, fix it, add a test that would have caught it, run pnpm verify, and tell me what was wrong.
```

**Design doesn't match**
```
The <screen> doesn't match docs/design/<board>.png (see docs/design/README.md) closely enough on <mobile/desktop>: <differences>. Fix layout, spacing and hierarchy using the existing tokens and components (no one-off styles). Keep §7.3 rules.
```

**Session got long or confused**
```
Summarize what's done and what's left for this step in docs/progress/<step>.md, commit, and stop.
```
Then start a new session with: `Continue step <n> from docs/progress/<step>.md.`

**Deploy failed on Railway**
```
The Railway <staging/production> deploy of <service> failed. Logs: <paste>. Diagnose using PROMPT §17.6 and docs/deployment/railway.md, fix it, and tell me any setting I need to change in Railway.
```

---

## After the beta (v1.1, one prompt each)

Razorpay subscriptions + billing page + plans editor (§16.1, §8.11, §11) · progress photos (§8.8) · Kanban board · calendar month view + availability · email and web-push reminders · scoped check-in links · trainer MFA + Google sign-in · support tickets · global search · payment receipts (PDF) · tempo/progression in programs · data-deletion automation (§12.4).
