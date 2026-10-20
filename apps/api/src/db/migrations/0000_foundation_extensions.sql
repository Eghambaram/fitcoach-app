-- Foundation (step 1.2, PROMPT §4.5, §10.1, §10.5).
-- Extensions, the `app` schema with RLS context helpers, shared trigger functions and default grants.
-- The roles fitcoach_app (NOBYPASSRLS) and fitcoach_system (BYPASSRLS) are created by the idempotent
-- role bootstrap in migrate.ts, which always runs before migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO fitcoach_app, fitcoach_system;

-- Every function created from here on is opt-in: PUBLIC loses its default EXECUTE privilege.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- New tables get DML grants for both roles. That is safe because every table also gets
-- ENABLE + FORCE ROW LEVEL SECURITY in its migration (CI fails otherwise): without a policy,
-- fitcoach_app sees nothing. Append-only tables revoke UPDATE/DELETE explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO fitcoach_app, fitcoach_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO fitcoach_app, fitcoach_system;

-- Request context set per transaction by the API's DbContext interceptor:
--   select set_config('app.user_id', …, true), set_config('app.workspace_id', …, true), …
-- An empty or missing setting reads as NULL, so policies comparing against it match no rows.
CREATE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

CREATE FUNCTION app.current_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.workspace_id', true), '')::uuid $$;

CREATE FUNCTION app.current_client_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.client_id', true), '')::uuid $$;

-- 'trainer' | 'client' | 'platform_owner' | 'system' (SystemDb) | NULL
CREATE FUNCTION app.current_actor() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.actor', true), '') $$;

GRANT EXECUTE ON FUNCTION
  app.current_user_id(),
  app.current_workspace_id(),
  app.current_client_id(),
  app.current_actor()
TO fitcoach_app, fitcoach_system;

-- Shared trigger for `updated_at` columns (PROMPT §10.1).
CREATE FUNCTION app.set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

GRANT EXECUTE ON FUNCTION app.set_updated_at() TO fitcoach_app, fitcoach_system;
