# FitCoach — Product Owner MVP Review

> **Status: accepted and applied** to `PROMPT.md` (MVP Edition, §1A), `CLAUDE.md` and `PHASES.md`. Recommended answers to the decisions in §8 were adopted as D12 and D18–D25.
> Review of `PROMPT.md` (Next.js + NestJS + PostgreSQL on Railway, Cloudflare R2) from a product-owner point of view.
> Purpose: decide what ships in the first testable MVP, what waits, what's missing, and what you (the founder/PO) must decide.
> Once you accept it, Claude Code should treat the **MVP scope** in §3 as the cut line and build in the order of §7.

---

## 1. Verdict

**The spec is strong on quality and safety, but too big for a first MVP.** It describes a v1.0 SaaS product (trainer app + client app + payments + platform admin + PWA), which is roughly 30–40 build prompts.

The goal of the MVP is narrower: **prove that 5–10 real Indian personal trainers will run their week in FitCoach and keep using it after a month.** Payments, analytics and admin polish don't help prove that.

Recommendation:
- **Keep** the architecture, security model, data rules and design system exactly as written. These are expensive to retrofit and they protect client health data.
- **Cut the feature scope** to the trainer's weekly loop, plus a minimal client app and a minimal admin.
- **Add three things trainers in India will expect** that the spec under-serves: package and session tracking with payment-due reminders, WhatsApp-first client access, and starter program templates.

Result: about **22–26 prompts and 2–3 weeks** to a beta you can put in front of trainers, instead of 30–40 prompts and 3–6 weeks.

---

## 2. Who the MVP is for (sharpened)

**Beta user:** an independent trainer in India with 10–40 clients, mixing gym and online sessions, currently using WhatsApp, notes and Excel or Google Sheets.

**Their weekly pain, in their words:**
1. "Enquiries come on Instagram/WhatsApp and I forget to follow up."
2. "I don't know who has how many sessions left or who hasn't paid."
3. "Writing workouts and tracking weights for every client takes too long."
4. "I can't easily show clients their progress."

**MVP promise to test:** *"Run your leads, sessions, workouts and client progress from your phone — in one place."*

Pain #2 (packages and payments) is barely in the spec, but trainers raise it constantly. It's added below as a Must.

---

## 3. MVP scope — the cut line

Priority: **MVP** = needed for beta · **v1.1** = right after beta feedback · **Later** = only if trainers ask or paid users need it.

### 3.1 Trainer app

| Feature | Priority | Notes / change vs spec | PROMPT § |
|---|---|---|---|
| Signup, email verification, login, logout, password reset | **MVP** | as spec | 12.2 |
| Trainer onboarding (3 steps) + first-run checklist | **MVP** | **Add** checklist: publish public page → add first lead/client → assign first program | new |
| Public enquiry page + share link + QR | **MVP** | as spec | 8.2 |
| Leads list, stage tabs, search/filters, Add Lead, duplicate check | **MVP** | as spec | 8.2 |
| Lead drawer (Overview, Activity, Notes) + WhatsApp/Call | **MVP** | Details tab can be merged into Overview edit mode | 8.2 |
| Follow-ups (create, due, complete) | **MVP** | as spec; reminders in-app only at first | 8.2 |
| Kanban board for leads | v1.1 | the list with stage tabs covers the workflow | 8.2 |
| Trial booking + conflict protection + attendance | **MVP** | as spec | 8.2, 8.6 |
| Lead → client conversion | **MVP** | as spec (critical) | 8.2 |
| Onboarding wizard with drafts | **MVP** | as spec | 8.4 |
| Clients list + detail (Overview, Workouts, Schedule, Check-ins, Progress, Notes) | **MVP** | Nutrition tab hidden | 8.3 |
| **Packages and sessions remaining** | **MVP (new)** | package name, price, sessions included, start/expiry; completed or no-show sessions deduct (configurable); "2 sessions left" and "expires in 5 days" badges | 8.11 → promote |
| **Manual payment records + payment due** | **MVP (new)** | record cash/UPI/bank payment; "payment due / package expiring" in Needs Attention; WhatsApp reminder via click-to-chat with a template | 8.11 → promote |
| Calendar day/week + agenda (mobile) | **MVP** | month view v1.1 | 8.6 |
| Recurring sessions (e.g. Mon/Wed/Fri 7 am for 8 weeks) | **MVP** | essential for trainers; expand into rows as spec says | 8.6 |
| Availability windows | v1.1 | MVP shows conflicts only | 8.6 |
| Exercise library (seeded ~80–120 common exercises, no videos) + custom exercises | **MVP** | media URLs optional | 8.5 |
| **Starter program templates** (e.g. Beginner full body 3×/week, Fat loss 4×/week, Upper/Lower) | **MVP (new)** | real, editable templates — not fake data; big time-saver | new |
| Program builder (workouts → exercises with sets/reps/load/rest/notes) | **MVP** | drop tempo and per-week variation for MVP | 8.5 |
| Assign program + rolling planned sessions | **MVP** | as spec | 8.5 |
| Live workout logging (trainer at gym) | **MVP** | as spec; per-set save | 8.5 |
| Check-in inbox + mark reviewed | **MVP** | as spec | 8.7 |
| Measurements + trend charts | **MVP** | as spec | 8.8 |
| Progress sharing toggles | **MVP** | per metric | 8.8 |
| Progress photos (R2, consent) | v1.1 | high privacy/storage cost; validate demand first | 8.8 |
| Dashboard (today, needs attention, KPIs, activity) | **MVP** | **change** the "New messages" KPI in the mockup → "Payments due / packages expiring" | 8.1 |
| In-app notifications | **MVP** | as spec | 8.10 |
| Email notifications to trainer | v1.1 | auth emails are MVP | 8.10 |
| Communication log | **MVP (light)** | log call/WhatsApp outcome from the lead/client drawer; no separate Messages page | 8.10 |
| Messages page / chat | Later | hide nav item | 8.10 |
| Templates page | v1.1 | follow-up and payment message snippets can live in Settings for MVP | 8.12 |
| Nutrition module | Later | hide nav item | 8.9 |
| Billing page (own subscription) | v1.1 | beta is free — see decision D-1 | 8.11 |
| Global search (⌘K) | v1.1 | per-page search is enough | 8.1 |
| Data export (CSV of clients/leads/sessions) | **MVP (simple)** | builds trust: "your data is yours" | 12.4 |
| Settings: profile, public page, units, timezone, check-in rules, sessions list | **MVP** | MFA for trainers v1.1 | 8.12 |

### 3.2 Client app

| Feature | Priority | Notes |
|---|---|---|
| **Invite via WhatsApp link** (one-time login link the trainer shares) | **MVP (change)** | Email-only OTP is friction for many Indian clients. The trainer taps "Invite" → WhatsApp opens with a single-use, expiring link → the client lands logged in (60-day session). Email OTP stays as the re-login fallback. |
| Home (today's workout, next session, sessions left in package) | **MVP** | sessions-left is a high-value, low-cost addition |
| My workouts + workout details + log own workout | **MVP** | only if the trainer enables self-logging |
| Daily check-in | **MVP** | as spec |
| Progress (shared metrics only) | **MVP** | |
| Schedule (own sessions) | **MVP** | |
| Profile (limited fields) | **MVP** | |
| Scoped check-in link without login | v1.1 | the invite link plus long session covers it |
| Google sign-in for clients | Later | |
| Nutrition, messages | Later | |

### 3.3 Platform owner (you)

| Feature | Priority | Notes |
|---|---|---|
| Separate login + MFA | **MVP** | security, cheap to do right once |
| Trainer list + detail (status, usage counts, last active) | **MVP** | |
| Suspend / reactivate with reason (audited) | **MVP** | |
| Assign plan / extend trial manually | **MVP** | needed while billing is manual |
| Audit log viewer (simple table) | **MVP** | |
| Health page (DB, jobs, email, R2, storage budget) | **MVP (simple)** | |
| Overview KPIs (trainers, active, clients, activation) | **MVP (simple)** | real counts only; no revenue cards until billing is live |
| Plans & entitlements editor | v1.1 | seed plans via migration for MVP |
| Razorpay subscriptions + webhooks + invoices | v1.1 | turn on when the beta proves value — see D-1 |
| Support tickets | v1.1 | MVP: "Help" opens WhatsApp/email to you |
| Announcements, analytics page, support access grants | Later | |

### 3.4 Platform & quality

| Item | Priority | Notes |
|---|---|---|
| Railway staging + production, Postgres backups, nightly dump to R2 | **MVP** | |
| RLS + guards + tests | **MVP** | non-negotiable (health data) |
| PWA install (manifest, icons, app shell) | **MVP** | cheap; feels like an app on phones |
| Web push for check-in and session reminders | v1.1 | on iPhone it only works once the app is installed to the home screen |
| Offline queue | Later | as spec |
| English UI with strings kept translatable | **MVP** | Hindi/Tamil etc. later |
| Data deletion workflow automation | v1.1 | MVP: documented manual procedure run by you, with an audit entry |

---

## 4. Gaps found in the spec (add these)

1. **Packages, sessions remaining, renewals and payment due.** This is the biggest gap for trainers. Add tables or fields to `client_packages` (`sessions_included`, `sessions_used`, `starts_on`, `expires_on`, `price_paise`, `status`), and a rule for whether a no-show or late cancel uses a session (a workspace setting). Add a "Payments & packages" attention group on the dashboard.
2. **WhatsApp-first communication.** Use click-to-chat message templates throughout: follow-up, trial confirmation, invite link, payment reminder, check-in nudge. No API costs, no approval process. These need `{first_name}`, `{trainer_name}` and `{link}` placeholders, editable in Settings.
3. **First-run experience.** A new trainer currently lands on an empty dashboard. Add a 4-step checklist card with progress, and empty states that point to the next action.
4. **Starter templates.** Seeded, editable program templates and an exercise library big enough to build a real program in under 5 minutes.
5. **Activation and retention instrumentation.** Record product events in `activity_events` (or a small `product_events` table) so you can measure §6 without a third-party analytics tool.
6. **Feedback loop.** An in-app "Send feedback" button that creates a row you can see on the platform page. Beta users need a zero-friction channel.
7. **Late cancellation / no-show policy** per workspace, linked to session deduction.
8. **Session notes per appointment** ("worked on squat depth") visible on the client timeline — trainers expect this.
9. **Legal pages.** Real privacy policy and terms covering health data, consent and deletion requests, and naming a contact for privacy requests. Get them reviewed against India's Digital Personal Data Protection Act before inviting real clients. The spec rightly avoids claiming compliance, but the pages still need to exist.
10. **Known limitations, stated up front.** No group or batch sessions (one client per appointment), no client self-booking, no in-app chat. Put them in a beta FAQ so trainers aren't surprised.

---

## 5. Conflicts between mockups and spec (resolve in the design)

| Mockup shows | MVP decision |
|---|---|
| Trainer dashboard KPI "2 New messages" | Replace with "Payments due / packages expiring" |
| Client app "Messages with Trainer" chat screen | Replace with a "Contact trainer" card (WhatsApp / call) |
| Client "Nutrition Plan" with calorie ring | Hidden in MVP |
| "Strength +47%" and multi-metric "Client Progress Overview %" chart | Remove; per-exercise best set (or estimated 1RM, labelled) and per-metric charts |
| Landing page sportswear brand logos, "Trusted by 5,000+ trainers", "#1 Platform" | Remove |
| Enquiry page "4.9 (124 reviews)" | Remove |
| Platform overview revenue, MRR and payment cards | Hidden until billing is live; show "Billing not configured" |
| Pricing page with 4 plans and "Start Free Trial" | MVP: "Free during beta" banner; the plans are shown as "coming soon" or hidden |
| Lead drawer "Files" tab | Not in MVP |

---

## 6. MVP success metrics (decide before launch)

| Metric | Definition | Beta target (suggested) |
|---|---|---|
| Activation | Trainer publishes the public page **and** adds ≥ 3 clients **and** assigns ≥ 1 program within 7 days of signup | ≥ 60% of beta trainers |
| Weekly active trainer | Logs ≥ 3 sessions or workouts in a week | ≥ 50% at week 4 |
| Lead capture used | ≥ 1 enquiry received via the public page per trainer in 30 days | ≥ 40% |
| Client engagement | Invited clients who submit ≥ 2 check-ins per week | ≥ 30% |
| Retention | Trainer still weekly-active at day 30 | ≥ 50% |
| Willingness to pay | Beta trainers who say they'd pay ₹499+/month (interview) | ≥ 40% → turn on Razorpay |

Targets are starting points to judge the beta, not industry benchmarks.

---

## 7. Release plan

| Stage | Who | Scope | Exit criteria |
|---|---|---|---|
| **Alpha** (week 1–2) | You + 1 friendly trainer | Phases 0–2 + clients + calendar + workout logging | Full spine works on staging; no data-loss or access bugs |
| **Closed beta** (week 3–6) | 5–10 trainers, free | All **MVP** items in §3 | Activation and week-4 metrics measured; top 10 issues fixed |
| **v1.1 / paid launch** | Open signup | Razorpay, plans editor, photos, Kanban, email reminders, web push, support tickets | ≥ 40% of beta trainers willing to pay; billing tested end-to-end in Razorpay test mode |

**Revised build order** (replaces PROMPT §20 phases 2–6 for the MVP):
1. Foundation (unchanged): monorepo, Docker, auth, roles/RLS, shells, R2, first Railway deploy
2. Public page → leads → follow-ups → calendar + trials (incl. recurring) → conversion → onboarding
3. Clients + **packages/sessions/payments** → exercise library + **starter templates** → program builder → assignment → live workout
4. Client app (**WhatsApp invite link**, home, workouts, check-in, progress, schedule) → check-in inbox → measurements + sharing
5. Dashboard + notifications + first-run checklist + feedback button + product events
6. Minimal platform admin (trainers, suspend, plan/trial, audit, health) → PWA install → CSV export → legal pages → production on Railway

---

## 8. Decisions needed from you (PO/founder)

| # | Decision | Recommendation |
|---|---|---|
| D-1 | Charge during beta? | **No** — free beta, manual plan assignment; switch on Razorpay in v1.1 |
| D-2 | Client login method | **WhatsApp-shared one-time link + email OTP fallback** (no SMS — SMS in India needs DLT registration and costs per message) |
| D-3 | Does a no-show or late cancel use a package session? | Workspace setting, default **yes for no-show, no for cancel > 12 h before** |
| D-4 | Group / batch sessions in MVP? | **No** — list as a known limitation; revisit if ≥ 3 beta trainers ask |
| D-5 | Progress photos in MVP? | **No** — v1.1, after consent flow and storage budget are proven |
| D-6 | Languages | English at launch; keep strings translatable |
| D-7 | Beta size and source | 5–10 trainers you can talk to weekly (gym contacts, Instagram trainers) |
| D-8 | Domain | Buy the domain and put it on Cloudflare now (needed for R2 media and email sending) |
| D-9 | Legal | Draft privacy policy + terms; get a lawyer review before real client data |

---

## 9. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Scope creep from the full spec | Beta slips by weeks | Treat §3 as the cut line; anything else needs a written reason |
| Claude Code drifts across sessions | Inconsistent code/UI | One feature per session; CLAUDE.md rules; `pnpm verify` gate; review each PR yourself |
| RLS / two-role setup slows the early build | Slower Phase 1 | Accept it — it's the cheapest moment to get it right; tests catch mistakes |
| Clients don't engage (no check-ins) | Weak value proof | WhatsApp invite link, sessions-left on the client home, trainer nudge templates |
| Trainers keep using WhatsApp/Sheets | Low retention | Packages/payments and the follow-up list must save them time on day 1; CSV import of an existing client list (v1.1 if asked) |
| Railway running costs before revenue | Burn | Keep production lean (1 replica each, small Postgres); staging off-hours if acceptable; watch the usage dashboard |
| R2 free tier exceeded | Unexpected bill | Storage budget in the app; photos deferred to v1.1 |
| Health data incident | Trust and legal risk | RLS, audit, private bucket, minimal data collection, no photos in MVP |

---

## 10. Changes to apply to PROMPT.md (if you accept this review)

1. Add a §1a "MVP scope" pointing to this file's §3 as the cut line; mark v1.1/Later items "do not build yet".
2. Promote packages, sessions-remaining and manual payments (§8.11) into the core spine; add the dashboard attention group.
3. Add the WhatsApp invite link flow for clients (§8.3, §9, §12.2) and WhatsApp message templates (§8.10, §8.12).
4. Add starter program templates and a larger exercise seed (§8.5, §10.6).
5. Add the first-run checklist, feedback button and product events (§8.1, §16).
6. Replace the mockup KPI "New messages" and the client chat screen as in §5.
7. Replace §20 with the revised build order in §7, and update §21 Definition of Done to the MVP journey plus packages.
