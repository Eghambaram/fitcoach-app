# ADR-0017: Next.js ≥16: proxy.ts for coarse redirects only

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D17)

## Decision
`apps/web/proxy.ts` (Node runtime) only checks whether an `fc_session` cookie exists and redirects `/app`, `/client` and `/platform` to the right login page. Layouts call `GET /v1/auth/me` and redirect by actor; the API enforces everything.

## Why
Current framework convention; authorization belongs in the API.

## Consequences
- `cookies()` and `headers()` are async.
- A forged cookie passes `proxy.ts` but is rejected by the API.
