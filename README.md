# FitCoach — Personal Trainer Copilot (MVP build pack)

This repository started as a spec; Claude Code builds the app from it one step at a time (progress: `PHASES.md`).

## Run it locally

Needs Docker Desktop (running), Node 24 and pnpm 12. Details, URLs and troubleshooting: [`docs/local-development.md`](docs/local-development.md).

```bash
cp .env.example .env
docker compose up -d     # Postgres :5432, Mailpit :8025, RustFS (S3) :9000/:9001
pnpm install
pnpm db:migrate
pnpm dev                 # web http://localhost:3000 · api http://localhost:4000
```

**Product:** a mobile-first app for independent personal trainers in India: leads → trials → clients → packages → programs → workouts → check-ins → progress, plus a simple client app and a platform-owner admin.
**Release:** MVP closed beta (free, invite-only, 5–10 trainers).
**Stack:** Next.js (web) · NestJS (API) · PostgreSQL · Cloudflare R2 (files) · Railway (staging and production) · Docker Desktop (local).

## What's in the pack

| File                    | What it is                                                                                            | Who reads it                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `CLAUDE.md`             | Working rules for Claude Code: MVP cut line, security, data rules, commands, Railway and R2 specifics | Claude Code reads it automatically every session         |
| `PROMPT.md`             | The full product and technical spec (MVP Edition). §1A is the scope cut line                          | Claude Code, you                                         |
| `PHASES.md`             | 7 phases, 28 ready-to-paste prompts, a "Done when" check for each                                     | You, one prompt per session                              |
| `MVP_REVIEW.md`         | Product-owner reasoning: what's in, what waits and why, beta metrics, risks                           | You                                                      |
| `docs/design/*.png`     | Four reference boards: the visual direction                                                           | Claude Code, you                                         |
| `docs/design/README.md` | Screen-by-screen index: status, MVP changes, spec section, build step                                 | Claude Code, you                                         |
| `docs/source/`          | The original briefs, superseded and kept for history                                                  | Nobody, unless you're checking where something came from |

## How to start

1. Create an empty GitHub repo, unzip this pack into it, and commit.
2. Do the one-time setup in `PHASES.md` → "Before you start" (Docker Desktop, Node 24, pnpm, Claude Code, Railway project, Cloudflare R2 buckets, domain, email provider).
3. Open Claude Code in the repo and paste prompt **0.1** from `PHASES.md`.
4. Work through the steps in order, one fresh session per step. Check each step's "Done when" list yourself on your phone and desktop before moving on.

## Decisions already made

These are listed in `PROMPT.md` §1 (D1–D25). Change them there before you start if you disagree:

- The beta is free, and plans are assigned manually. Razorpay comes in v1.1.
- Clients join through a WhatsApp invite link, with an email code as the fallback. There's no SMS.
- A no-show uses a package session. A cancel more than 12 hours before doesn't.
- There are no group sessions, progress photos or chat in the MVP.
- The app launches in English, with text kept translatable.

## Before real client data

- Have a lawyer review the privacy policy and terms. India's Digital Personal Data Protection Act applies to client health data.
- Run the restore drill in `docs/runbooks/restore.md` once. Claude Code writes it in step 6.2.
