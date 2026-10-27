# ADR-0055: Client invite links, client sessions and the first client policies

- **Status:** Accepted
- **Date:** 2026-10-27
- **Source:** Step 4.1; D19, §8.3 (portal access), §12.2, §9, §10.5, CLAUDE.md rules 1–4, 7, 9, 12, 20d–20e

## Decision

1. **Invites get their own table, `client_invites`, not `auth_tokens (purpose='client_invite')`.**
   - A client has no login until they accept, and may have no email. `auth_tokens.user_id` is required and those rows aren't tenant-scoped.
   - `client_invites` belongs to a client in a workspace (composite FK, trainer RLS) and stores only the HMAC of 32 random bytes.
   - Links are single use, expire after 7 days and can be revoked. Creating a new link revokes every older open one. Revoked and used are final (CHECK + RLS).
2. **Accepting is pre-session (SystemDb), in one transaction, row-locked:**
   - consume the link and revoke the client's other open links;
   - link or create the client's login;
   - record `client.portal_joined` with the terms version in the audit log;
   - start a 60-day sliding client session.
   - The preview (`POST /v1/client-auth/invite/preview`) returns only the trainer's name, photo and business, never client data (§12.2).
   - Tokens travel in request bodies, so API logs never carry them. The `/invite/[token]` page sets a `no-referrer` referrer policy and `noindex` (meta tags).
3. **Client logins.** `users.email` becomes nullable: a client without an email still gets a login.
   - **Existing client login with the same email:** it is reused, so one login can belong to clients of several trainers.
   - **Email already belongs to a trainer account:** a separate login without an email is created (one login can't be both). That client signs in by invite link only.
   - **Which client a login opens:** the email code signs into the client that login used most recently. A workspace switcher is v1.1.
4. **Client sessions carry `client_id`** (composite FK to `clients`). A CHECK makes `client_id` present exactly for `actor = 'client'`.
   - `SessionGuard` puts the client id into the request context; it never comes from the request.
   - A session stops resolving when its client is archived, access is revoked or the workspace is cancelled.
5. **`ClientScopeGuard`** (after `WorkspaceGuard`) requires a client and workspace for every client request and makes the portal read-only in a suspended workspace. `RolesGuard` keeps clients off every trainer route (`@Roles("trainer")`); client routes are `@Roles("client")`.
6. **First client policies** (`app.portal_client_id()` is set only when the actor is a client):
   - the client's own `clients` row;
   - their workspace and its members;
   - the trainer's profile;
   - the trainer's avatar file.
   - Nothing else (leads, notes, packages, payments, appointments, workouts, settings, templates, invites) has a client policy.
   - Column restriction is done by the client API, which selects allow-listed columns. Client-facing views (e.g. appointments without notes) arrive with the screens that need them (4.2).
7. **Email code** (`auth_tokens.purpose = 'email_otp'`):
   - 6 digits, 10 minutes, 5 attempts. The hash is keyed by the token row id, so equal codes never collide.
   - Rate-limited per IP and per email.
   - Wrong attempts are counted in a committed transaction before the error is returned.
   - Requesting a code always answers 202. Verifying answers the same message for a wrong code, an unknown email or an expired code.
8. **WhatsApp:** the invite uses the workspace's `client_invite` template with `{link}` and opens `wa.me` (click-to-chat, rule 20d).
   - The web shows the link once in a dialog with **Open WhatsApp** and **Copy link**. A second tap is more reliable on phones than opening WhatsApp after a network call, which popup blockers stop.
   - Nothing claims the message was sent: the status says "Invited, expires …". `communication_logs` is lead-only, so invites aren't logged there.
9. **Status shown to the trainer:** revoked › active (a login is linked) › invited (an open link) › expired › not invited. "Turn off access" revokes open links, sets `clients.portal_revoked_at` and signs the client out everywhere. A new invite turns access back on.

## Why

Most beta clients in India use WhatsApp more than email (D19). A link that signs them straight in, with an email code as the fallback, needs no passwords and no SMS. Keeping invites tenant-owned and sessions client-scoped means every later client screen inherits the isolation.

## Consequences

- Step 4.2 adds client policies and views per screen (workouts, appointments without notes, packages without prices), with the same `app.portal_client_id()` pattern.
- The data-deletion runbook must cover client logins (users without email included).
- `/terms` and `/privacy` pages don't exist yet; the invite screen states what is accepted in plain text, as signup does.
