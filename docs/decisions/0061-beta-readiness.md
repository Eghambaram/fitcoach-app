# ADR-0061: Beta readiness — feedback, data export, PWA and the public site

- **Status:** Accepted
- **Date:** 2026-10-28
- **Source:** Step 5.3; §1A.4, §1A.5, §6, §8.12, §10.2, §12, §14, §16.0, CLAUDE.md rules 13, 20, 20a, 22

## Decision

1. **Product events cover every measurable beta metric** (§1A.5). Added: `program_assigned`, `session_attended`, `workout_completed`, `client_invited`, `client_invite_accepted`, `check_in_submitted`, `feedback_sent`, `data_exported`. Each is written in the same transaction as the action, with ids, counts and enums only. The mapping from metric to events is in `docs/metrics.md`. "Willingness to pay" is an interview, not an event.

2. **Feedback is trainer-only and write-only.**
   - `POST /v1/feedback` stores the message and the in-app path it was sent from (`?from=`, validated as an `/app/...` path, never a URL or query string).
   - Rate limit: 10 per hour per user.
   - Trainers can't read feedback back (no SELECT grant), so the API makes the id itself instead of using `RETURNING`.
   - The platform owner triages it in step 6.1 as fitcoach_system; nobody can delete it.
   - It also works in a suspended workspace, so a suspended trainer can still tell us what's wrong.

3. **Data export: a background job builds a zip; the API serves it.**
   - **Request:** `POST /v1/exports` creates a `pending` row and queues `exports.generate`. Only one export may be pending at a time, with at most 5 a day per workspace.
   - **Queueing after commit:** the job is queued through a new `DbContext.afterCommit()`, so it never runs before its row is committed.
   - **The job:** runs as fitcoach_system, filters every query by the export's workspace, and writes six CSVs into one zip:
     - leads, clients, appointments, packages, payments, measurements;
     - the same formula-safe `csvCell` as the leads export, a BOM, and times in the workspace time zone;
     - money as rupees computed from integer paise, with no floats;
     - voided payments and measurements included and marked as such.
   - **Storage:** the zip goes to the private bucket under `exports/<workspace>/<id>.zip`.
   - **Retries:** the job is idempotent. A retry rewrites the same key, and only the run that marks the row `ready` records `data_exported`.
   - **Expiry:** downloadable for 24 hours. The hourly `exports.expire` job then deletes the object and marks the row `expired`; it also fails exports stuck `pending` for over 30 minutes. The R2 lifecycle rule on `exports/` (1 day) is the backstop.
   - **Ledger:** exports aren't counted in the `files` ledger; they are short-lived and outside the upload budget.

4. **Downloads go through the API, not a presigned URL.**
   - **What:** `GET /v1/exports/:id/download` checks the session, the workspace and the expiry on every request, then streams the zip through the same-origin `/api` proxy.
   - **Deviation:** PROMPT §12.4 and PHASES describe a 24 h presigned link.
   - **Why:**
     - A link that works for 24 hours without a session is a bearer token for the whole workspace's data, and the 5-minute presign cap (§17.7) exists to avoid exactly that.
     - In the compose stack the storage endpoint is a Docker host name browsers can't reach.
     - The browser keeps talking only to the web origin (rule 10).
   - **Cost:** the API reads the object (one Class B operation) per download. Beta exports are small.

5. **Export is allowed while suspended** (§16.0): the export endpoints are `AllowInactiveWorkspace`, and the RLS insert policy doesn't require a writable workspace.

6. **PWA, hand-rolled** (§14):
   - **Manifest:** `app/manifest.ts` (standalone, charcoal theme, `#F6F7F3` background).
   - **Icons:** generated from the logo mark — 192 and 512 px in "any" and maskable versions (stroke inside the safe zone), plus an Apple touch icon.
   - **`public/sw.js`:**
     - precaches the offline page and icons;
     - caches hashed `/_next/static` assets cache-first;
     - is **network-only** for `/api/*` and for every page, so authenticated HTML is never cached. A page that can't load shows `/offline`.
   - **Registration:** production builds only, so `next dev` is never served stale code.
   - **Install card:** in Settings (trainers) and More (clients). It uses the browser's install prompt where there is one, step-by-step Add to Home Screen on iPhone, and is hidden once installed.
   - **Docker:** the web image now copies `public/` (standalone output doesn't).

7. **The public site states only what's true:**
   - **`/`:** board 01 adjusted. No logo row, "trusted by" or ranking claims, and the phone mockup is drawn with labels only — no invented people or numbers. CTA: "Request beta access". Signed-in users are redirected to their home, and the API is only asked when a session cookie exists.
   - **`/pricing`:** "Free during the beta", what's included, and request access.
   - **`/beta`:** what works and the known limitations.
   - **`/privacy` and `/terms`:** written from what the code does (§12), each with a "Beta draft — needs legal review before launch" notice.
   - **Links:** signup and the client invite page link the terms and privacy policy, opening in a new tab so the form stays filled in.

8. **"Request beta access" opens an email; nothing is stored.**
   - **How:** the form builds a `mailto:` to the build-time `NEXT_PUBLIC_BETA_CONTACT_EMAIL` and says so on the page. When the address is unset it shows "Not configured" (rule 20).
   - **Why:** a stored request form would be a new public, rate-limited, captcha'd endpoint and a table of prospects' contact details. That is more surface than a beta of 5–10 invited trainers needs.

9. **Help in the navigation:** "Send feedback" and "Help" (`/beta`) are live. They sit at the bottom of the desktop sidebar and in More on mobile, and "Send feedback" carries the current page as `?from=`.

10. **Accessibility pass:** axe runs over every main trainer and client screen, the public pages and the offline page, on desktop and mobile. It found:
    - the shared "Not configured" notice's text was below 4.5:1 on its background (now the neutral tone);
    - the landing hero sat outside a landmark (now inside `main`).

## Consequences

- Export size is bounded by memory: the zip is built in memory, which is fine for beta workspaces. Streaming the zip to storage is the change if workspaces grow.
- The request-access form depends on the visitor having an email app; the address is shown on the page as a fallback.
- Platform owner screens for feedback triage and export failures arrive in step 6.1.
