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

FKs from these tables to `users` / `workspaces` are added in step 1.3 when those tables exist.

## Proven by tests

- Every `public` table has ENABLE + FORCE RLS (`rls-coverage.db.test.ts`).
- Role attributes, no schema changes by either role, no app access to `pgboss` / `drizzle`, rate limiter restricted to system, empty context reads as NULL and is transaction-scoped, the migration re-runs idempotently (`roles.db.test.ts`).
- Cross-tenant isolation, empty-context isolation, a tampering insert into another workspace, insert-only audit with forged-entry rejection, rate-limit counting (`support-tables.db.test.ts`).
- Over HTTP: requests run as `fitcoach_app` with an empty context when there's no session, and tenant ids in headers, query or body are ignored (`request-pipeline.api.test.ts`).
