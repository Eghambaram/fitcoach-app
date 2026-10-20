# FitCoach — Design Reference Index

The four boards in this folder are the **visual direction** for FitCoach: layout, density, hierarchy, colour use and component style.
They are **not** a feature list. **PROMPT.md decides what gets built.** Where a board and the spec disagree, follow the spec and the "MVP notes" below.

| File | Contents |
|---|---|
| `01-public-site-and-platform-admin.png` | Public landing, platform owner dashboard, pricing, trainer signup, public enquiry page, subscription management |
| `02-trainer-dashboard-and-clients.png` | Trainer dashboard (desktop), client profile, live session, trainer mobile app, add-client wizard, client progress |
| `03-leads-crm.png` | Leads table, lead drawer, mobile lead flows (list, detail, add, book trial, convert, share enquiry page) |
| `04-client-app.png` | 12 client mobile screens |

**Status key:** **Build** = match closely · **Adjust** = match the layout, apply the MVP notes · **v1.1** / **Later** = don't build in the MVP (no route, no nav item).

---

## Rules for using these boards (all screens)

1. **Never ship content from the boards.** People photos, names (Sarah Chen, Alex Carter, Rahul Kumar…), numbers, dates (2024), ratings and brand logos are placeholders. Don't extract or reuse any image from the boards. Use initials avatars, licensed photos (record them in `docs/assets.md`) or neutral illustrations.
2. **Every number comes from the database.** Show real values or a proper empty state.
3. **Navigation follows PROMPT §6**, not the board. Boards show items that aren't in the MVP (Nutrition, Messages, Billing, Templates, Subscriptions…).
   - Trainer mobile bottom nav: **Home · Leads · Clients · Calendar · More**.
   - Client bottom nav: **Home · Workouts · Progress · Check-in · More**.
4. **Remove everything listed in PROMPT §7.3:** third-party brand logos, "Trusted by 5,000+", "#1 Platform", "4.9 (124 reviews)", "Strength +47%", cross-client progress percentages.
5. **Ignore typos and breadcrumbs** in the boards ("Dasboort", "Deadsbat").
6. **Tokens come from PROMPT §7.1.** Don't sample colours from the images.
7. **Use the board for the look, the spec for the behaviour.** Fields, validation, states and rules come from the PROMPT section listed.
8. **Design both widths.** Where a board shows only desktop or only mobile, design the other width with the same components (PROMPT §7.2).

---

## Board 01 — Public site & platform admin
`01-public-site-and-platform-admin.png`

| # | Screen (label on board) | Status | MVP notes | PROMPT § | Step |
|---|---|---|---|---|---|
| 1 | Public Landing Page | **Adjust** | Keep the dark hero, headline style, phone mockup and five feature tiles. Remove the brand logo row, "Trusted by 5,000+ Trainers Worldwide" and "#1 Platform for Personal Trainers". Primary CTA → **"Request beta access"** (to `/beta` or signup with code). Show "Watch Demo" only if a real video exists. Nav: Product · Features · Pricing · For Trainers · Log in. | §6, §7.3 | 5.3 |
| 2 | Superadmin Dashboard | **Adjust** | Keep the sidebar, KPI card grid, tables and activity feed. Sidebar = MVP items only (Overview · Trainers · Feedback · System Health · Audit Logs · Settings). KPI cards = §16.0 counts. **Remove** revenue/MRR, paying trainers, trial conversions, Revenue Growth chart and Trainers by Plan donut. Replace with a "Billing not configured" notice. "Recent trainer signups" table keeps an Approve action. | §16.0 | 6.1 |
| 3 | Trainer Plans & Pricing | **v1.1** (plan cards) | MVP `/pricing`: "Free during beta" hero, short feature list, request-access form. The 4-plan layout comes with billing in v1.1. | §6, §16.1 | 5.3 |
| 4 | Trainer Sign Up / Onboarding | **Adjust** | Keep the split layout and 3-step stepper (Account → Profile → Business). **Remove** Google and Apple buttons (Google is v1.1; Apple isn't planned). Add a **beta invite code** field. Replace the left-panel claims ("14-day free trial", "No credit card required"…) with honest beta copy. | §12.2 | 1.3, 1.4 |
| 5 | Public Enquiry Page | **Build** | Remove "★ 4.9 (124 reviews)". Keep the three mode cards, form layout, right-hand photo panel with benefits, and "Send Enquiry". Add the versioned consent checkbox and privacy note. The trainer's photo comes from their upload (public bucket). | §8.2 | 2.1 |
| 6 | Subscription Management | **v1.1** | Don't build. | §16.1 | — |

---

## Board 02 — Trainer dashboard & clients
`02-trainer-dashboard-and-clients.png`

**Top row (desktop and tablet)**

| Screen | Status | MVP notes | PROMPT § | Step |
|---|---|---|---|---|
| Trainer dashboard "Good morning, Alex" | **Adjust** | Keep the header, date switcher, KPI cards, Today's Schedule with Start/Join buttons and Recent Activity. KPI cards = §8.1: replace **"New messages"** with **"Payments due / packages expiring"**, and add Follow-ups due and New leads. **Replace** the "Client Progress Overview" multi-metric chart with the **Needs attention** list (§8.1 order, WhatsApp reminder buttons). Add the **first-run checklist** card for new workspaces. Sidebar = MVP items only (no Nutrition, Messages, Billing, Templates). | §8.1 | 5.1 |
| Client profile (hero, tabs, goal, stats, latest progress, quick actions) | **Adjust** | Keep the hero, status pills, goal card, stat tiles and sparklines. Tabs → **Overview · Packages · Workouts · Schedule · Check-ins · Progress · Notes** (no Nutrition). **Remove "Strength +47%"**; show weight/body fat/waist only from real data. **Add a package card** (sessions left, expiry, amount due, Record payment). Quick actions → Log Session · Record Payment · Update Progress · WhatsApp. | §8.3, §8.3A | 3.1, 3.2 |
| "Upper Body Strength" exercise list (4 of 6 completed) | **Build** | Session progress bar, exercise rows with completed ticks, Complete Session and Add Exercise. Exercise thumbnails come from exercise media URLs, with a neutral placeholder icon when missing. | §8.5 | 3.5 |

**Bottom row (trainer mobile)**

| Screen | Status | MVP notes | PROMPT § | Step |
|---|---|---|---|---|
| Welcome "Your Coaching Business, Simplified." | **Adjust** | Keep it. "Continue with Email" leads to login; hide "Continue with Google" (v1.1). | §12.2 | 1.4 |
| Home "Good morning, Alex" | **Adjust** | Week strip and Today list as shown. Add compact KPI cards and Needs attention below. Bottom nav → Home · Leads · Clients · Calendar · More. | §8.1 | 5.1 |
| Clients list | **Build** | Tabs Active/Paused/Archived with counts, search, status pills, + button. | §8.3 | 3.1 |
| Add New Client — Basic Information | **Build** | Step 1 of **4**; WhatsApp/Phone/Email preferred contact chips. | §8.4 | 2.5 |
| Goals & Training | **Build** | Step 2; mode radio cards, goal radios. | §8.4 | 2.5 |
| Client & Training — Baseline & Consent | **Adjust** | Step 3; keep the measurement fields and consent checkbox. Add the separate photo consent. Add **Step 4 Review & create**, with optional package and program, then "Invite via WhatsApp". Keep Save as Draft on every step. | §8.4 | 2.5 |
| Client Progress (mobile) | **Build** | Metric selector, range selector, chart tooltip, latest measurements list with change. | §8.8 | 4.4 |

---

## Board 03 — Leads CRM
`03-leads-crm.png`

| Screen | Status | MVP notes | PROMPT § | Step |
|---|---|---|---|---|
| Leads (desktop table) | **Build** | Header actions Add Lead · Share Enquiry Page; KPI cards; stage tabs with counts; filters (source, training mode, follow-up date, sort); table columns and row actions as shown. **List view only** (no Kanban toggle). Sidebar = MVP items. | §8.2 | 2.2 |
| Lead drawer "Rahul Kumar" | **Adjust** | Keep the header, New Lead pill, WhatsApp/Call/Schedule buttons, Lead Information with copy icons, Next Action card with Overdue badge, and the Book Trial Session / Convert to Client footer. Tabs → **Overview · Activity · Notes** (Files is v1.1). | §8.2 | 2.2, 2.3 |
| Mobile — Leads list | **Build** | Stage chips, overdue dot, follow-up line, + button. Bottom nav Home · Leads · Clients · Calendar · More. | §8.2 | 2.2 |
| Mobile — Lead detail | **Build** | Call / WhatsApp / Schedule buttons; Overview/Activity/Notes; Book Trial / Convert footer. | §8.2 | 2.2 |
| Mobile — Add New Lead | **Build** | Fields as shown. "How did they hear about you?" maps to `source`. Duplicate-match panel appears inline. | §8.2 | 2.2 |
| Mobile — Book Trial Session | **Build** | Date, start time, session type (in-person/online), location or link, notes. Conflict error shown inline. | §8.2, §8.6 | 2.6 |
| Mobile — Convert to Client | **Build** | Checklist (import info, preserve history, set initial package, start onboarding), Initial Package select, Start Date, Convert & Continue. The package select is enabled in step 3.2. | §8.2, §8.3A | 2.4, 3.2 |
| Mobile — Your Enquiry Page (share) | **Build** | URL with copy, QR code, Share Page, form preview, Preview button. | §8.2 | 2.1 |

---

## Board 04 — Client app (12 screens)
`04-client-app.png` — numbered left-to-right, top row 1–6, bottom row 7–12.

| # | Screen | Status | MVP notes | PROMPT § | Step |
|---|---|---|---|---|---|
| 1 | Login / Welcome | **Adjust** | Keep the hero and the four benefit lines. Main path is the **WhatsApp invite link**. This screen offers **"Get a sign-in code by email"** plus "Ask your trainer for a new link". Remove "Continue with Google". | §9, D19 | 4.1 |
| 2 | Home / Dashboard | **Adjust** | Keep the greeting, week strip, Today's Workout and View Workout. Tiles: **Sessions left** (from the package), shared metric (weight change only if shared), streak, next session. Quick actions → Log workout (if enabled) · Check-in · **Contact trainer** (not Messages). Bottom nav → Home · Workouts · Progress · Check-in · More. Show the check-in prompt card when a check-in is due. | §9 | 4.2 |
| 3 | My Workouts | **Build** | Upcoming/Past tabs, This Week / Next Week groups, Start/View. | §9, §8.5 | 4.2 |
| 4 | Workout Details | **Build** | Overview/Exercises tabs, trainer notes, equipment chips, estimated time, muscle groups. Muscle-group chips are required. The body diagram is optional and only if drawn as an original SVG. "Start Workout" appears only when self-logging is enabled. | §8.5 | 4.2 |
| 5 | Live Workout (During Session) | **Build** | Shares its UI with the trainer live workout: exercise media, reps/weight/rest tiles, set list, Complete Set, Previous/Next. | §8.5 | 3.5, 4.2 |
| 6 | Check-in (Client Input) | **Build** | Five feeling options with icon + label, energy and sleep sliders, soreness chips, notes, Submit Check-in. | §8.7 | 4.3 |
| 7 | Progress Overview | **Build** | Weight/Body Fat/Measurements tabs, big current value, change since start, chart with tooltip, 1M/3M/6M/1Y. **Shared metrics only.** | §8.8 | 4.4 |
| 8 | Measurements | **Build** | List with change and sparklines. "+ Add" only if the trainer enabled self-logging. | §8.8 | 4.4 |
| 9 | Nutrition (if provided) | **Later** | Don't build. | §8.9 | — |
| 10 | Messages with Trainer | **Don't build** | Replace with a **Contact trainer** screen or card: trainer name and photo, WhatsApp and Call buttons. | §8.10 | 4.2 |
| 11 | Schedule | **Build** | Month header, week strip, list of own sessions with mode (in-person/online). No trainer notes. | §9 | 4.2 |
| 12 | Profile / Settings | **Adjust** | Menu → My Goals (read-only) · My Progress · My Workouts · Check-in History · Settings (units, contact preference) · Help & Support · Sign Out. Remove "Nutrition Plan". | §9 | 4.2 |

---

## Screens with no board (design them from the system)

Calendar day/week and recurring series sheet (§8.6) · Packages tab, sell/renew package sheet and record payment sheet (§8.3A) · Program builder and starter templates gallery (§8.5) · Exercise library (§8.5) · Check-ins inbox (§8.7) · Settings sections incl. message templates (§8.12) · Notifications panel (§8.10) · First-run checklist (§8.1) · Invite acceptance screen `/invite/[token]` (§9) · Platform Trainers list/detail, Feedback, Health, Audit Logs (§16.0) · `/beta` FAQ, privacy and terms pages.

Build these with the same tokens and shared components, and match the density and tone of the nearest board (Board 02 for trainer screens, Board 04 for client screens).
