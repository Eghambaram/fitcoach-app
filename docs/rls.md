# Row-level security

How tenant isolation works in the database (PROMPT §4.5, §10.5). **Update this file in the same PR as any migration that adds a table or policy.**
Tests: `apps/api/src/db/*.db.test.ts` (`pnpm test:db`, needs Docker).

## Roles

| Role               | Attributes                        | Used for                                                               |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------- |
| owner (`postgres`) | owns every object                 | `migrate.js` only: role bootstrap, SQL migrations, pg-boss schema      |
| `fitcoach_app`     | LOGIN, **NOBYPASSRLS**, no CREATE | every request, inside the request transaction (`DbContextInterceptor`) |
| `fitcoach_system`  | LOGIN, **BYPASSRLS**, no CREATE   | `SystemDb.run(reason, fn)` only, plus pg-boss (schema `pgboss`)        |

Roles are created or updated on every migration run (`src/db/bootstrap-roles.ts`) with passwords from `DB_APP_PASSWORD` / `DB_SYSTEM_PASSWORD`. Neither role can create objects in `public`. `fitcoach_app` has no access to the `pgboss` or `drizzle` (migration journal) schemas.

## Request context

For every request, `DbContextInterceptor` opens a transaction on the `fitcoach_app` pool and runs:

```sql
select set_config('app.user_id', $1, true), set_config('app.workspace_id', $2, true),
       set_config('app.client_id', $3, true), set_config('app.actor', $4, true);
```

The values come only from the session-derived auth context (step 1.3), never from the request. The `true` flag makes them transaction-local. Policies read them through `app.current_user_id()`, `app.current_workspace_id()`, `app.current_client_id()` and `app.current_actor()`. An empty setting reads as `NULL`, so **no session means no rows**.

`SystemDb.run()` sets `app.actor = 'system'`.

## Defaults for new tables

- `ALTER DEFAULT PRIVILEGES` grants `SELECT, INSERT, UPDATE, DELETE` to both roles on new tables in `public`. Every table must also `ENABLE` **and** `FORCE ROW LEVEL SECURITY` in the migration that creates it. Without a policy, `fitcoach_app` then sees nothing.
- New functions are **not** executable by `PUBLIC`; grant `EXECUTE` explicitly.
- CI gate: `rls-coverage.db.test.ts` fails if any `public` table lacks ENABLE + FORCE RLS. The allow-list (global reference data only, each with a reason) is currently empty.
- Append-only tables revoke `UPDATE`/`DELETE` (and `TRUNCATE`) explicitly.

Standard policy shapes for the tables that arrive from step 1.3:

```sql
-- trainer, own workspace (writes additionally require a writable workspace)
USING (workspace_id = app.current_workspace_id() AND app.current_actor() = 'trainer')
-- client, own rows (column restrictions via client_portal_* views)
USING (client_id = app.current_client_id() AND app.current_actor() = 'client')
```

## Tables

| Table                | fitcoach_app                       | Policy                                                                                                                                                             | fitcoach_system                   | Notes                                                                                                                                     |
| -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `rate_limit_buckets` | no privileges                      | none (RLS forced)                                                                                                                                                  | DML (bypasses RLS)                | Written only via `app.check_rate_limit(key, window_seconds, max)`, executable only by the system role. Keys are pre-hashed by callers.    |
| `idempotency_keys`   | SELECT, INSERT, UPDATE (no DELETE) | `idempotency_keys_own`: `user_id = current_user_id() AND workspace_id IS NOT DISTINCT FROM current_workspace_id()` (USING + WITH CHECK)                            | DML                               | Unique per (workspace, user, endpoint, key), with NULLs not distinct. Purged by a system job (step 5.2).                                  |
| `audit_logs`         | INSERT only                        | `audit_logs_insert_own_context`: `actor_kind = current_actor() AND actor_user_id = current_user_id() AND workspace_id IS NOT DISTINCT FROM current_workspace_id()` | SELECT, INSERT (no UPDATE/DELETE) | Immutable for everyone. The app can't forge entries for another user, workspace or actor kind, and can't read them back (no `RETURNING`). |

`idempotency_keys` got FKs to `users` / `workspaces` in step 1.3. `audit_logs` deliberately has none, so history outlives the rows it describes.

### Identity, workspace and platform tables (step 1.3)

Helpers: `app.trainer_workspace_id()` returns the session's workspace only when the actor is `trainer`. `app.workspace_is_writable()` is true for `trialing`, `active` and `past_due` workspaces (false when pending approval, suspended or cancelled).

| Table                                                                       | fitcoach_app                                                                    | Policy                                                                              | Notes                                                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                                                                     | SELECT; UPDATE of `password_hash` only                                          | own row: `id = current_user_id()`                                                   | Created pre-session through SystemDb (signup). Verification and status change only through auth flows or the platform owner.                      |
| `profiles`                                                                  | SELECT; UPDATE of `display_name`, `phone_e164`                                  | own row                                                                             |                                                                                                                                                   |
| `sessions`                                                                  | SELECT; UPDATE of `revoked_at`, `revoked_reason` only                           | own sessions: `user_id = current_user_id()`                                         | A user can revoke their own sessions but never extend one. Created and resolved by SystemDb (the cookie lookup happens before there's a session). |
| `auth_tokens`                                                               | none                                                                            | —                                                                                   | Verify and reset links; issued and consumed only through SystemDb.                                                                                |
| `workspaces`                                                                | SELECT; UPDATE of name, slug, city, coaching modes, timezone, country, currency | trainer: `id = trainer_workspace_id()`; update also needs `workspace_is_writable()` | Status and ownership change only through the platform owner (audited).                                                                            |
| `workspace_members`                                                         | SELECT                                                                          | trainer's workspace                                                                 | One workspace per trainer (unique `user_id`).                                                                                                     |
| `trainer_settings`                                                          | SELECT, UPDATE                                                                  | trainer's workspace; update needs a writable workspace                              | D25 policy, units, thresholds.                                                                                                                    |
| `subscription_plans`                                                        | SELECT                                                                          | `USING (true)`                                                                      | Global reference data (`beta` seeded). Covered by RLS rather than the allow-list.                                                                 |
| `workspace_plans`                                                           | SELECT                                                                          | trainer's workspace                                                                 | Assigned at signup and by the platform owner (audited).                                                                                           |
| `message_templates`                                                         | SELECT, INSERT, UPDATE (no DELETE)                                              | read own + global (`workspace_id IS NULL`); write own only, in a writable workspace | 7 global defaults seeded by migration and copied at signup. Global rows are read-only.                                                            |
| `package_presets`                                                           | SELECT, INSERT, UPDATE (no DELETE)                                              | same as templates                                                                   | 3 global defaults with no price; archive instead of delete.                                                                                       |
| `product_events`                                                            | INSERT only                                                                     | own context, like `audit_logs`                                                      | Never read by the app. fitcoach_system can't UPDATE.                                                                                              |
| `platform_roles`, `beta_invites`, `email_outbox`, `notification_deliveries` | none                                                                            | —                                                                                   | fitcoach_system only (CLIs, auth flows, email service).                                                                                           |

## Proven by tests

- Every `public` table has ENABLE + FORCE RLS (`rls-coverage.db.test.ts`).
- Role attributes, no schema changes by either role, no app access to `pgboss` / `drizzle`, rate limiter restricted to system, empty context reads as NULL and is transaction-scoped, the migration re-runs idempotently (`roles.db.test.ts`).
- Cross-tenant isolation, empty-context isolation, a tampering insert into another workspace, insert-only audit with forged-entry rejection, rate-limit counting (`support-tables.db.test.ts`).
- Over HTTP: requests run as `fitcoach_app` with an empty context when there's no session, and tenant ids in headers, query or body are ignored (`request-pipeline.api.test.ts`).
- Trainer B can't see trainer A's users, profiles, workspace, members, settings, plan, templates or presets. An empty context sees only global reference data. A client context isn't treated as the trainer. Forbidden inserts and reads fail, column grants block status, plan and verification changes, and a suspended workspace is read-only. Sessions can be revoked but not extended, product events can't be forged, and the last beta-code slot can't be used twice under concurrency (`auth-tables.db.test.ts`).
- Over HTTP: trainer B can neither list nor revoke trainer A's sessions, and forged cookies get 401 (`auth.api.test.ts`).
