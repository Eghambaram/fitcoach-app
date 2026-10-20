-- Foundation RLS, grants and the rate-limit function (step 1.2, PROMPT §10.3, §10.5, §12.1).
-- Policies are documented in docs/rls.md and proven by src/db/*.db.test.ts.

-- ---------------------------------------------------------------------------------------------
-- rate_limit_buckets — written only by fitcoach_system (BYPASSRLS) through app.check_rate_limit().
-- RLS is forced with no policy, and fitcoach_app has no privileges at all.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON rate_limit_buckets FROM fitcoach_app;

-- Fixed-window counter. Returns true while the caller is within `p_max` hits for the current window.
-- Callers pass an already-hashed key (e.g. 'login:ip:<ipHash>'), never a raw IP or email.
CREATE FUNCTION app.check_rate_limit(p_key text, p_window_seconds integer, p_max integer)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_window_start timestamptz;
  v_hits integer;
BEGIN
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 OR p_max IS NULL OR p_max <= 0 THEN
    RAISE EXCEPTION 'check_rate_limit: window and max must be positive' USING ERRCODE = '22023';
  END IF;

  v_window_start := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO public.rate_limit_buckets AS bucket (key, window_start, hits, expires_at)
  VALUES (p_key, v_window_start, 1, v_window_start + make_interval(secs => p_window_seconds))
  ON CONFLICT (key, window_start) DO UPDATE SET hits = bucket.hits + 1
  RETURNING bucket.hits INTO v_hits;

  RETURN v_hits <= p_max;
END
$$;

GRANT EXECUTE ON FUNCTION app.check_rate_limit(text, integer, integer) TO fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- idempotency_keys — a user sees and writes only their own keys, in their current workspace.
-- Expired rows are purged by a system job (step 5.2), so fitcoach_app cannot DELETE.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY idempotency_keys_own ON idempotency_keys
  FOR ALL TO fitcoach_app
  USING (
    user_id = app.current_user_id()
    AND workspace_id IS NOT DISTINCT FROM app.current_workspace_id()
  )
  WITH CHECK (
    user_id = app.current_user_id()
    AND workspace_id IS NOT DISTINCT FROM app.current_workspace_id()
  );

REVOKE DELETE ON idempotency_keys FROM fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- audit_logs — immutable. fitcoach_app may only INSERT rows that match its own request context,
-- so it can't forge entries for another user or workspace; it can't read them back either.
-- fitcoach_system (platform aggregates, admin actions) may read and insert, never change.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_insert_own_context ON audit_logs
  FOR INSERT TO fitcoach_app
  WITH CHECK (
    actor_kind = app.current_actor()
    AND actor_user_id = app.current_user_id()
    AND workspace_id IS NOT DISTINCT FROM app.current_workspace_id()
  );

REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON audit_logs FROM fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM fitcoach_system;
