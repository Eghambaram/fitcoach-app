# ADR-0040: Web shell conventions: honest navigation, API-decided access, one-click email confirm

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** Step 1.4; §6, §7, §4.2

## Decision

(1) Navigation config lives in `apps/web/features/shell/navigation.ts`, MVP items only. Screens that arrive in later steps are shown disabled with "Coming soon" (not links) and are switched on by the step that builds them. (2) Server layouts pass only an area name to the client `AppShell` (icons can't cross the server/client boundary). (3) Access is decided by the API: layouts call `GET /v1/auth/me`, and `/platform` calls `GET /v1/platform/access` (platform owners only) and renders the refusal. `proxy.ts` only redirects when there's no cookie. (4) Email confirmation takes a button click rather than happening on page load. (5) Until the client login (4.1) and platform login (6.1) exist, every sign-in goes through `/login`. (6) The `/api` proxy builds the upstream URL from the API origin plus the path, never by resolving the path against it.

## Why

Rule 22 forbids dead navigation, yet the spec wants the full MVP menu visible. Disabled items with "Coming soon" satisfy both and show trainers what's coming. Authorization in the UI alone isn't authorization (§5). Email security scanners open links automatically and would consume single-use tokens. Resolving `//host/path` against a base URL produces another host (an SSRF found by the proxy tests).

## Consequences

- `react/no-unescaped-entities` is limited to `>` and `}` — English copy is full of apostrophes and React escapes text.
- Local e2e runs against the dev server, which compiles routes on first visit; the Playwright assertion timeout is 15 s and each test sends its own `X-Forwarded-For` so API rate limits don't leak between tests.
- The signup terms checkbox has no links yet; the privacy and terms pages arrive in step 5.3 and must be linked there.
