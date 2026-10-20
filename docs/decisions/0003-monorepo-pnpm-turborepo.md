# ADR-0003: Monorepo with pnpm workspaces and Turborepo

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D3, §4.1)

## Decision
One repository: `apps/web`, `apps/api`, `packages/shared` (Zod schemas, enums, metrics, conversions), `packages/api-client` (generated typed client), `packages/config` (tsconfig/eslint/prettier).

## Why
A single source of truth for validation and types across web and API; a contract and both of its consumers change atomically.

## Consequences
- One Zod schema per contract, used by both the web form and the API DTO.
- Docker builds use `turbo prune --scope=<app> --docker` from the repo root.
- Railway `watchPatterns` keep a web-only change from redeploying the API.
