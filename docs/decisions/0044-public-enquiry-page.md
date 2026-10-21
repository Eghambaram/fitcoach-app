# ADR-0044: Public enquiry page: signed form token, silent bot drops, versioned consent, narrow SystemDb service

- **Status:** Accepted
- **Date:** 2026-10-21
- **Source:** Step 2.1; §8.2, §8.12, §8.10, §12.1

## Decision

(1) **Time-to-submit is server-signed.** `GET /v1/public/pages/:slug` returns a `formToken` = issue time + HMAC (SESSION_SECRET, workspace id). `POST /v1/public/enquiries` checks it: under 3 s (`ENQUIRY_MIN_FILL_MS`) counts as a bot, over 24 h or forged means "reload". The web form waits out any remaining time before sending, so a fast human using autofill is never dropped. (2) **Bots get `{ ok: true }` and nothing is stored**: when the honeypot field (`website`, hidden from people and assistive tech) is filled, or the form comes back too fast. Rate limits (5 per 10 min per hashed IP, 30 per hour per workspace, 120 page reads per minute per IP) and optional Turnstile (`TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) apply on top. (3) **Consent is versioned.** `lead_forms` rows are immutable; changing the form's fields or consent wording inserts version n+1, every `lead_consents` row points at the exact version, and an enquiry sent for an older version gets `409 FORM_OUTDATED` ("reload"). (4) **One narrow SystemDb service** (`PublicPageService`) is the only anonymous path: it reads whitelisted columns of published pages in live workspaces (suspended, pending or cancelled = offline), and its write inserts exactly lead + consent + activity + notification + product event + audit entry in one transaction. Leads get no fitcoach_app write policies until step 2.2. (5) **Notifications are written now, shown later**: the `notifications` table exists because the enquiry must notify the trainer; the bell UI arrives in step 5.2. (6) **Server-generated QR** (`qrcode`, PNG 1024 px or SVG) encodes the page URL with `?src=qr`, so scans are their own lead source next to the per-source share links.

## Why

A client-reported fill time can be forged. A signed time costs nothing and doesn't need a session. Silent drops tell bots nothing. Consent has to be provable per enquiry, so the wording each lead agreed to must never change underneath it.

## Consequences

- Testing time-to-submit needs either a 3 s wait (e2e) or a token signed in the past (API tests sign with the test SESSION_SECRET).
- Rotating SESSION_SECRET invalidates open enquiry forms (visitors are asked to reload), as well as sessions.
- Related fixes made in this step: the typed API client now declares its return type explicitly (previously it emitted `createClient.Client<…>`, which resolved to `any`), and the OpenAPI document normalises bare nullable scalars. Top-level nullable strings in response contracts carry a length cap, because a bare `z.string().nullable()` is misread as an array by Nest's swagger metadata.
