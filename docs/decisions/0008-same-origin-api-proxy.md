# ADR-0008: Same-origin API through a web proxy over Railway private networking

- **Status:** Accepted
- **Date:** 2026-10-20
- **Source:** PROMPT.md §1 (D8, §4.2)

## Decision

The browser only talks to the web domain. `apps/web/app/api/[...path]` streams requests to the API at `API_INTERNAL_URL`, forwarding cookies, `x-request-id` and the client IP and passing `Set-Cookie` back untouched; it never caches.

## Why

First-party cookies, no CORS, smaller attack surface.

## Consequences

- State-changing requests must carry `Origin == WEB_ORIGIN` and `X-FitCoach-Request: 1` (CSRF).
- The API trusts `X-Forwarded-*` only from the proxy hop.
- In the MVP the API needs no public Railway domain; smoke tests reach `/api/v1/health/ready` through the web. A public API domain is added only when billing webhooks arrive (v1.1).
