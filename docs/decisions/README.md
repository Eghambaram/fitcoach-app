# Architecture Decision Records

One short file per decision (title, decision, why, consequences). ADR-0001 to ADR-0025 record D1–D25 from `PROMPT.md` §1 and are **accepted** — change them in PROMPT.md first if you disagree. ADR-0026 onward record decisions made while building (0026–0034 answer the step 0.1 open questions).
New decisions take the next number (`0026-…`). Superseded ADRs stay, marked `Status: Superseded by ADR-00xx`.

| ADR                                               | Decision                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [0001](0001-no-supabase-nestjs-postgres.md)       | No Supabase — NestJS API + PostgreSQL, Next.js is UI only                                  |
| [0002](0002-hosting-railway-r2-docker.md)         | Hosting: Railway for compute and Postgres, Cloudflare R2 for files, Docker Desktop locally |
| [0003](0003-monorepo-pnpm-turborepo.md)           | Monorepo with pnpm workspaces and Turborepo                                                |
| [0004](0004-drizzle-sql-migrations.md)            | Drizzle ORM with SQL migrations as the source of truth                                     |
| [0005](0005-tenant-key-workspace-id.md)           | Tenant key is workspace_id; one workspace per trainer                                      |
| [0006](0006-layered-authz-guards-rls.md)          | Layered authorization: NestJS guards plus Postgres RLS with a non-BYPASSRLS app role       |
| [0007](0007-custom-auth-opaque-sessions.md)       | Auth built in the API with opaque, revocable Postgres sessions                             |
| [0008](0008-same-origin-api-proxy.md)             | Same-origin API through a web proxy over Railway private networking                        |
| [0009](0009-rsc-reads-query-mutations.md)         | Reads in Server Components, mutations via TanStack Query through /api — no Server Actions  |
| [0010](0010-jobs-pg-boss-no-redis.md)             | Background jobs with pg-boss inside the API; no Redis                                      |
| [0011](0011-files-r2-two-buckets.md)              | Files in Cloudflare R2 with a private and a public bucket per environment                  |
| [0012](0012-billing-deferred-free-beta.md)        | Subscription billing is v1.1; the closed beta is free with manual plan assignment          |
| [0013](0013-email-provider-abstraction.md)        | Email through an EmailProvider abstraction (SMTP, Resend, console)                         |
| [0014](0014-messaging-log-and-click-to-chat.md)   | Messaging in the MVP = communication log + click-to-chat; no chat                          |
| [0015](0015-online-only-mutations.md)             | Mutations require connectivity; per-set idempotent saves; offline banner                   |
| [0016](0016-defaults-india-units.md)              | Defaults: IN / INR / Asia/Kolkata per workspace; canonical kg and cm                       |
| [0017](0017-next16-proxy-coarse-redirects.md)     | Next.js ≥16: proxy.ts for coarse redirects only                                            |
| [0018](0018-packages-core-mvp.md)                 | Client packages, sessions remaining and manual payments are core MVP                       |
| [0019](0019-client-access-whatsapp-invite.md)     | Client access via a WhatsApp-shared one-time login link; email OTP fallback                |
| [0020](0020-whatsapp-click-to-chat-templates.md)  | WhatsApp-first communication through click-to-chat message templates                       |
| [0021](0021-starter-templates-exercise-seed.md)   | Starter program templates and ~100 seeded exercises ship as reference data                 |
| [0022](0022-no-group-sessions.md)                 | No group or batch sessions in the MVP                                                      |
| [0023](0023-no-progress-photos.md)                | No progress photos in the MVP                                                              |
| [0024](0024-english-translatable.md)              | English UI at launch with translatable strings                                             |
| [0025](0025-no-show-late-cancel-policy.md)        | No-show and late-cancel rule is a workspace setting                                        |
| [0026](0026-node-24-lts.md)                       | Standardise on Node 24 LTS                                                                 |
| [0027](0027-postgres-17-local.md)                 | Postgres 17 locally until Railway's version is confirmed                                   |
| [0028](0028-phase-2-step-order.md)                | Phase 2 order: conversion and onboarding before the calendar                               |
| [0029](0029-beta-invite-cli.md)                   | Audited `pnpm beta:invite` CLI before the platform UI                                      |
| [0030](0030-product-events-from-day-one.md)       | Record product events from step 1.3                                                        |
| [0031](0031-time-based-packages-informational.md) | Time-based packages: "N per week" is informational                                         |
| [0032](0032-signup-business-fields.md)            | Signup step 3 ("Business") fields                                                          |
| [0033](0033-beta-client-limit-50.md)              | Default active-client limit of 50 for beta workspaces                                      |
| [0034](0034-original-logo-no-people-photos.md)    | Original logo mark; no people photos                                                       |
| [0035](0035-toolchain-version-pins.md)            | Toolchain pins: NestJS 11, TypeScript 5.9, ESLint 9                                        |
| [0036](0036-rustfs-local-object-storage.md)       | RustFS replaces MinIO for local object storage                                             |
| [0037](0037-muted-foreground-contrast.md)         | Muted text token darkened to #6A736D for WCAG AA                                           |
