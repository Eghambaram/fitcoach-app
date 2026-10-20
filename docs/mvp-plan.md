# FitCoach — MVP Plan

> Maps every step in `PHASES.md` to the `PROMPT.md` sections it implements, the tables it introduces (MVP table rule, §10.2: a table is created in the step that first uses it) and the risks to watch. The answers to the step 0.1 open questions are at the end.
> Written in step 0.1 (2026-10-20). Tick progress in `PHASES.md`, not here.

---

## Phase 0 — Plan

| Step | Implements | Output |
|---|---|---|
| 0.1 Read and plan | §0–§22, MVP_REVIEW, design index | `docs/architecture.md`, `docs/decisions/0001–0025`, this file |

---

## Phase 1 — Foundation
Exit (§20): a trainer can sign up and log in on Railway staging; RLS tests green.

| Step | PROMPT § | New tables / artefacts | Risks / notes |
|---|---|---|---|
| **1.1** Monorepo + Docker | §3, §4.1, §18, §19 (tooling) | pnpm + Turborepo workspaces, `docker-compose.yml` (Postgres, Mailpit, MinIO + `minio-init`), `.env.example`, root scripts from the CLAUDE.md table (stubs exit 0), ESLint/Prettier, Vitest, Playwright skeleton, CI | Pin Node and Postgres versions here (Q2, Q3). Check that `nestjs-zod`, `@nestjs/swagger` and the chosen Zod major work together before writing contracts. |
| **1.2** API skeleton, roles, RLS harness | §4.3, §4.5, §10.1, §10.5, §10.6, §12.1, §12.2 (CSRF), §17.5 (health) | roles `fitcoach_app` / `fitcoach_system`, `app.current_*()` helpers, extensions (`pgcrypto`, `citext`, `btree_gist`, `pg_trgm`), `rate_limit_buckets` + `app.check_rate_limit`, `idempotency_keys`, `audit_logs`, pg-boss schema; `docs/rls.md` | Hardest step of the build. drizzle-kit snapshots drift when generated SQL is hand-edited: keep RLS, grants and functions in separate `--custom` migrations. pg-boss's schema is created by the owner and needs explicit grants to the app/system roles. Testcontainers on Windows needs Docker Desktop running. |
| **1.3** Authentication | §4.4, §12.2, D7, §8.12 + §8.3A (defaults only) | `users`, `sessions`, `auth_tokens`, `profiles`, `workspaces`, `workspace_members`, `trainer_settings`, `subscription_plans` (seed `beta`), `workspace_plans`, `beta_invites`, `platform_roles`, `message_templates`, `package_presets`, `email_outbox`, `notification_deliveries` | Beta codes are needed from day one, but the platform UI to create them only arrives in 6.1 (Q4). Signup step 3 ("Business") has no field list in the spec (Q10). Constant-time responses and rate limits need tests. |
| **1.4** Web shells + design system + proxy | §4.2, §6, §7, D8, D9, D17 | design tokens, shared components (§7.2), trainer/client/platform layouts (MVP nav only), `/api/[...path]` proxy, `lib/api/*`, `proxy.ts`, signup/login/forgot/reset/verify pages | A logo mark and imagery are needed (Q7). Boards use photos of people; we may not reuse them. The proxy must stream bodies and pass `Set-Cookie` untouched. |
| **1.5** File storage | D11, §11, §17.7 | `files`; `StorageService`; upload endpoint (sharp → WebP + thumbnail); purge job stub | `sharp` native binaries differ between Windows dev and Linux Docker. Install per platform and test in the `full` compose profile. Checksum options `WHEN_REQUIRED` for R2. The 1.5 photo upload needs a minimal profile-photo UI before Settings (2.1). |
| **1.6** Dockerfiles, Railway staging, CI | §17.1–§17.6 | `apps/*/Dockerfile`, `apps/*/railway.json`, compose `full` profile, CI deploy + smoke, `docs/deployment/{railway,r2}.md` | **Needs your accounts first:** Railway project, Cloudflare R2 staging buckets + token, email provider + sender domain (Q6). Next standalone output in a pnpm monorepo needs `outputFileTracingRoot`. The API needs no public domain in the MVP (ADR-0008); smoke tests go through the web proxy. |

---

## Phase 2 — Growth spine
Exit: enquiry → lead → follow-up → trial → client works end-to-end.

| Step | PROMPT § | New tables | Risks / notes |
|---|---|---|---|
| **2.1** Settings + public enquiry page | §8.12, §8.2 (public page, share, enquiry), §12.1 | `trainer_public_pages`, `lead_forms`, `leads`, `lead_activities`, `lead_consents`, `notifications` | `POST /public/enquiries` is the first `SystemDb` write path: keep it narrow and audited. Turnstile is optional; honeypot + timing + rate limit always apply. QR generation runs on the server. |
| **2.2** Leads list + drawer | §8.2 (list, drawer, Add Lead, duplicates, CSV) | — (indexes: `pg_trgm` on search columns) | Duplicate detection runs "across leads **and** clients", but `clients` only exists from 2.4. Build the check so it includes clients once the table exists (2.4 adds that half plus a test). The list's CSV export streams directly; the full data export zip is 5.3. |
| **2.3** Follow-ups, comms log, templates | §8.2 (follow-ups), §8.10, §11 WhatsApp, D20 | `lead_follow_ups`, `communication_logs` | `next_follow_up_at` is maintained by a trigger. Test URL encoding with Hindi/emoji text. `wa.me` needs E.164 **without** `+`. |
| **2.4** Lead → client conversion | §8.2 (conversion), §10.3, §10.4, §18 | `clients`, `activity_events` | Concurrency test (double submit = one client) and forced-failure rollback test are mandatory. The package field stays disabled until 3.2. The `PLAN_LIMIT` check runs both in the service and in a DB trigger. Extends the 2.2 duplicate check to clients. |
| **2.5** Onboarding wizard | §8.4, §8.8 (measurement tables) | `client_onboarding_drafts`, `client_goals`, `client_consents`, `measurement_types`, `measurements` | Step 4's "optional package and program" depends on 3.2/3.4: show both disabled with honest copy until then (like 2.4). Consent rows carry notice version, timestamp, source and actor. |
| **2.6** Calendar, series, trials, attendance | §8.6, §10.3, D22, D25 | `appointments`, `appointment_series`, `appointment_changes` | Moved after conversion/onboarding (ADR-0028) so series have real clients. **Technical:** `ends_at` cannot be a Postgres *generated* column, because `timestamptz + interval` is not immutable; maintain it with a trigger instead. The exclusion constraint applies to `scheduled`/`confirmed` only. Leave a named attendance hook for 3.2. |

---

## Phase 3 — Coaching & packages
Exit: the trainer can sell a package, run a session and log a workout; sessions left update.

| Step | PROMPT § | New tables | Risks / notes |
|---|---|---|---|
| **3.1** Clients list + detail | §8.3 | `client_notes` | Archiving revokes the client's sessions (none exist until 4.1, so test against seeded rows). Tabs for later steps show honest empty states. |
| **3.2** Packages, ledger, payments | §8.3A, D18, D25, §8.1.1 (sessions left, payment due) | `client_packages`, `package_session_ledger`, `client_payments` | Core money logic. Tests: attendance double-submit deducts once, un-marking reverses, renewal closes the old package, the client API never returns prices. **Ambiguity (Q9):** what "N per week" means for time-based packages. |
| **3.3** Exercise library + templates | §8.5, D21, §10.6 | `exercises`, `programs`, `program_workouts`, `program_exercises` (+ seed migration) | About 100 original exercise descriptions plus 7 templates is a lot of content. Someone with training knowledge should review it before the beta (Q11). Seed rows have no media (ADR-0021). |
| **3.4** Program builder + assignment | §8.5 | `client_program_assignments`, `workout_sessions` | Drag-and-drop needs a keyboard alternative. Planned-session generation is limited to a rolling window and is idempotent; the job that extends it comes in 5.2. |
| **3.5** Live workout logging | §8.5, D15 | `workout_session_exercises`, `workout_sets` | Idempotent `PUT /workout-sets/:clientUuid`; restore after refresh; offline banner. "Mark attended" calls the 3.2 attendance path in one transaction. |

---

## Phase 4 — Client app & results
Exit: an invited client checks in, logs a workout, sees shared progress and sessions left.

| Step | PROMPT § | New tables / artefacts | Risks / notes |
|---|---|---|---|
| **4.1** Client invite + login | D19, §8.3 (portal access), §12.2, §9 (arrival) | `client_portal_*` views, `ClientScopeGuard` (uses `auth_tokens` from 1.3) | Single-use token under concurrency (row lock on consume). Rate-limited OTP: 10-minute expiry, 5 attempts. Clients with no email have no self-service re-login, only a new link from the trainer. |
| **4.2** Client app screens | §9, §7.3 adjustments | — | Feature flags must be enforced by the API, not only hidden in the UI. Reuse the 3.5 live-workout UI. Never expose session notes, prices or payments. |
| **4.3** Check-ins | §8.7 | `check_ins`, `check_in_revisions` | "Today" is the **client's local date** in the workspace timezone. Edits are allowed until local midnight. Label as "self-reported" and never diagnose. |
| **4.4** Measurements, charts, sharing | §8.8 (no photos) | `progress_shares` | Append-only (void + insert). Default is nothing shared. Recharts is client-only, so pass serialized data. Show % change only where it is meaningful. |

---

## Phase 5 — Dashboard & beta readiness
Exit: alpha with one trainer for a week, with no data or access bugs.

| Step | PROMPT § | New tables / artefacts | Risks / notes |
|---|---|---|---|
| **5.1** Dashboard + checklist | §8.1, §8.1.1, `docs/metrics.md` | `packages/shared/metrics.ts` | `GET /dashboard/summary` must avoid N+1 queries. Every count uses the workspace timezone. Deltas appear only when the comparison period has data. |
| **5.2** Notifications + jobs | §8.10, §13 | (pg-boss jobs) | Dedupe keys so a restart never double-notifies. Daily 07:00 runs **per workspace timezone**. Graceful SIGTERM. |
| **5.3** Beta readiness | §10.2 (`product_events`, `feedback`), §1A.5, §8.12 export, §14, §6 public pages | `product_events`, `feedback`; manifest + service worker; `/beta`, `/pricing`, `/privacy`, `/terms` | **Timing risk (Q5):** if events only start in 5.3, alpha usage and early signups go unrecorded. Legal pages need your details (Q8) and a lawyer's review. PWA icons need the logo (Q7). |

---

## Phase 6 — Platform & production
Exit: the closed beta opens to 5–10 trainers.

| Step | PROMPT § | New tables / artefacts | Risks / notes |
|---|---|---|---|
| **6.1** Platform owner | §16.0, §12.2 (MFA) | `mfa_factors`, `mfa_recovery_codes`, `platform_settings` | TOTP secrets encrypted with `APP_ENCRYPTION_KEY` (AES-256-GCM). Only aggregates via `SystemDb`, with no client PII. Every admin action audited. |
| **6.2** Backups + production | §17.2 (db-backup), §17.5, §12.4 | `infra/db-backup`, `docs/runbooks/{restore,data-deletion}.md` | The restore drill must actually be run once (by you). Production R2 needs the `media.<domain>` custom domain, so the domain must be on Cloudflare. |
| **6.3** Launch checklist | §21, CLAUDE.md DoD | `docs/launch-checklist.md` | No new features, only fixes. |

---

## Cross-cutting risks

| Risk | Mitigation |
|---|---|
| Scope creep from the full spec (v1.1/Later sections are right there in PROMPT.md) | §1A is the cut line; CLAUDE.md repeats it; any exception needs an ADR. |
| Drift across 28 separate sessions | One step per session; `pnpm verify` gate; architecture/ADR/CHANGELOG kept current; `docs/progress/<step>.md` when a session runs long. |
| RLS context lost outside the CLS transaction (silently empty results) | DbContext interceptor on every request; an empty-context test per table. |
| Windows dev vs Linux prod differences (sharp, line endings, path case) | `.gitattributes` with `* text=auto eol=lf`; the compose `full` profile as the parity check; CI runs on Linux. |
| Railway cost before revenue (two environments, each with Postgres) | One replica per service; usage alerts; consider pausing staging when idle. |
| R2 free tier shared by staging + production | App-level storage budget; no photos in the MVP; clean `pr-*` prefixes. |
| Health-data incident | RLS + guards + tests, private bucket, minimal data, no photos, audit logs, legal review before real clients. |

---

## Decisions from step 0.1 (resolved 2026-10-20)

All open questions were answered with the recommendations ("go with the recommendations").

| # | Question | Decision | Record |
|---|---|---|---|
| Q1 | Phase 2 step order | Conversion (2.4) → onboarding (2.5) → calendar (2.6); PHASES.md renumbered | ADR-0028 |
| Q2 | Node version | Node 24 LTS everywhere | ADR-0026 |
| Q3 | Postgres major version | Postgres 17 locally; re-check against Railway in step 1.6 | ADR-0027 |
| Q4 | Beta codes before the platform UI | Audited `pnpm beta:invite` CLI in step 1.3 | ADR-0029 |
| Q5 | Product events timing | `product_events` + `track()` from step 1.3 | ADR-0030 |
| Q6 | Domain and email | Buy the domain, put it on Cloudflare, use Resend with `noreply@<domain>`. **Founder action before step 1.6; domain name still to be supplied.** | — |
| Q7 | Brand assets | Original SVG logo; no people photos | ADR-0034 |
| Q8 | Legal and contact details | **Founder to supply before step 5.3** | — |
| Q9 | Time-based "N per week" | Informational only | ADR-0031 |
| Q10 | Signup step 3 fields | Business name, slug, city, modes, timezone; phone optional | ADR-0032 |
| Q11 | Seed content review | Founder (or a trainer friend) reviews exercises/templates after step 3.3 | — |
| Q12 | Beta client limit | 50 | ADR-0033 |
| Q13 | Repository layout | Work from the repo folder itself; founder cleans up the outer copies | — |
