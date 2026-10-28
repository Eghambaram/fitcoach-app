# ADR-0062: Platform owner — TOTP sign-in, AAL2 guard and audited admin over SystemDb

- **Status:** Accepted
- **Date:** 2026-10-28
- **Source:** Step 6.1; §12.2, §16.0, §1A.5, CLAUDE.md rules 2, 4, 8, 9, 12, 13

## Decision

1. **A separate sign-in with mandatory TOTP.**
   - **Password step:** `POST /v1/platform/auth/login` checks the password and an active `platform_roles` row, and creates a `platform_owner` session at **AAL1**. The session has a **12-hour absolute** expiry and doesn't slide. Accounts that aren't owners, are disabled or are unverified get the same "email and password don't match" as a wrong password.
   - **First sign-in:** enrols an authenticator (`mfa/setup` → `mfa/enable`) and shows **10 one-time recovery codes** once.
   - **Later sign-ins:** use `mfa/verify` with a code or a recovery code.
   - **AAL2:** both paths raise the session to AAL2 (`sessions.aal = 2`).
   - **Same cookie:** the session uses the same `fc_session` cookie as the trainer login, so signing in to the platform replaces a trainer session in that browser.

2. **`PlatformMfaGuard` fails closed.**
   - It runs after `RolesGuard` and refuses every platform-owner request at AAL1 with `403 MFA_REQUIRED`. Only routes marked `@AllowAal1()` get through: `auth/me`, logout, and the platform `status` / `mfa/*` endpoints.
   - New platform routes are protected without extra marking.
   - `SessionsService.resolve` also ends a platform session the moment its role is revoked.

3. **TOTP details** (otplib v13, RFC 6238: SHA-1, 6 digits, 30 s):
   - **Clock drift:** a tolerance of one period either side.
   - **Replays:** the last accepted time step is stored, and a code at or before it is refused. This stops a replay even inside the same period.
   - **Secret at rest:** encrypted with **AES-256-GCM** under the new required `APP_ENCRYPTION_KEY` (32 bytes, base64). Staging and production refuse the key from `.env.example`.
   - **Recovery codes:** stored as HMACs (like every other token), single use.
   - **Rate limit:** code attempts are limited to 10 per 15 minutes per owner.
   - **Locked tables:** `platform_mfa` and `platform_recovery_codes` have RLS forced and no grants for `fitcoach_app`.

4. **Admin data goes through `SystemDb` only,** in two services, each method with a stated reason:
   - `PlatformTrainersService` for the overview, trainers and account actions;
   - `PlatformOpsService` for invites, feedback, health and the audit log.

   The controller uses `@SkipDbContext()`. What leaves the API:
   - trainer account details (business name, owner name, email, status);
   - **counts** (leads, clients, appointments, workouts, sessions);
   - never a client's name or data (rule 8).

   `support_access_grants` (time-boxed access to tenant data) isn't needed for anything in §16.0, so it stays unbuilt.

5. **Every change is audited** with the owner as the actor:
   - approve;
   - plan / limit / trial end, with before and after;
   - suspend and reactivate, with a **required reason**;
   - password-reset email (the owner never sees the link);
   - revoke sessions;
   - invite create and revoke;
   - feedback status.

   Sign-in, MFA enrolment, verification and recovery-code use are audited too.

6. **Suspension:**
   - The workspace becomes `suspended`, which makes it read-only through the existing `WorkspaceGuard` and `ClientScopeGuard`. Export still works.
   - The trainer's sessions are revoked (rule 9). Signing in again shows the read-only banner.
   - An in-app notification carries the reason.
   - Reactivation notifies too.
   - Nothing is deleted.

7. **Approval:** `pending_approval → active`, plus an in-app notification and an "account is ready" email, matching the pending banner's promise.

8. **Overview counts are real queries:**
   - **Trainers:** total, signed in during the last 7 days, suspended, and pending.
   - **Activation (§1A.5):** among workspaces at least 7 days old, the share that within 7 days had a `public_page_published` event, at least 3 clients onboarded and a `program_assigned` event. When none qualify the rate shows "—", not 0%.
   - **Other counts:** invites accepted, open feedback, failed jobs in the last 24 hours.
   - **Billing:** shows "Not configured". There are no revenue cards.

9. **Health:** each check is OK, Degraded, Unknown or Not configured, never assumed healthy.

   | Check    | Based on                                                                                                                                         |
   | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
   | Database | a probe query                                                                                                                                    |
   | Jobs     | `job_runs` over the last 24 hours (Degraded if any failed) plus the oldest waiting pg-boss job (Degraded over 5 minutes); Unknown if nothing ran |
   | Email    | `notification_deliveries` over the last 24 hours; "Not configured" with the console provider                                                     |
   | R2       | the existing bucket probe                                                                                                                        |
   | Storage  | the files ledger against the budget and the hard limit                                                                                           |
   | Backups  | always **Unknown** until step 6.2 adds the db-backup heartbeat                                                                                   |

10. **The web app:**
    - **`/platform/login`:** sits outside the admin layout. A signed-out visit to any other `/platform/*` page is redirected there by `proxy.ts`.
    - **Admin layout:** turns 401, or a 403 for a platform session, into the sign-in page (which resumes at the code step), and shows "permission denied" to trainers and clients.
    - **Overview:** stays at `/platform`; there is no separate `/platform/dashboard`.
    - **Settings:** holds the beta invite codes. The `pnpm beta:invite` CLI keeps working on the same service.

## Consequences

- `APP_ENCRYPTION_KEY` must be set on Railway (api, staging and production) before this deploys, or the API refuses to start. Rotating it invalidates every owner's authenticator: they enrol again after an operator clears `platform_mfa`.
- A lost phone plus used-up recovery codes is recovered by an operator: revoke the owner's MFA (`delete from platform_mfa` as the owner role), then the next sign-in enrols again.
