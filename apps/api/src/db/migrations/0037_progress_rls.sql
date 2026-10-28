-- Progress: custom measurement types, progress sharing and the client's view of their measurements
-- (step 4.4, PROMPT §8.8, §10.5). Documented in docs/rls.md, proven by src/db/progress.db.test.ts.
-- Measurements stay append-only (rule 16): corrections void the row and insert a new one.

-- ---------------------------------------------------------------------------------------------
-- Measurement types: the trainer adds custom types for their workspace and can retire them.
-- ---------------------------------------------------------------------------------------------
CREATE POLICY measurement_types_trainer_insert ON measurement_types FOR INSERT TO fitcoach_app
  WITH CHECK (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable());
CREATE POLICY measurement_types_trainer_update ON measurement_types FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
CREATE POLICY measurement_types_client_select ON measurement_types FOR SELECT TO fitcoach_app
  USING (app.portal_client_id() IS NOT NULL AND workspace_id = app.current_workspace_id());
GRANT INSERT ON measurement_types TO fitcoach_app;
GRANT UPDATE (name, is_active) ON measurement_types TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON measurement_types FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Progress shares: one row per metric the client may see (default none).
-- ---------------------------------------------------------------------------------------------
-- A share may only name a global type or one of the same workspace (like measurements).
CREATE FUNCTION app.check_progress_share_type() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM measurement_types
    WHERE id = NEW.type_id AND (workspace_id IS NULL OR workspace_id = NEW.workspace_id)
  ) THEN
    RAISE EXCEPTION 'measurement type % is not available in this workspace', NEW.type_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER progress_shares_check_type BEFORE INSERT OR UPDATE OF type_id ON progress_shares
  FOR EACH ROW EXECUTE FUNCTION app.check_progress_share_type();

ALTER TABLE progress_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY progress_shares_trainer_select ON progress_shares FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY progress_shares_trainer_insert ON progress_shares FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
  );
CREATE POLICY progress_shares_trainer_delete ON progress_shares FOR DELETE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable());
CREATE POLICY progress_shares_client_select ON progress_shares FOR SELECT TO fitcoach_app
  USING (client_id = app.portal_client_id() AND workspace_id = app.current_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON progress_shares FROM fitcoach_app;
GRANT INSERT, DELETE ON progress_shares TO fitcoach_app;
REVOKE TRUNCATE ON progress_shares FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Measurements: a client sees only metrics shared with them, and adds their own (source
-- 'client') only with progress self-logging on and only for a shared metric.
-- ---------------------------------------------------------------------------------------------
CREATE POLICY measurements_client_select ON measurements FOR SELECT TO fitcoach_app
  USING (
    client_id = app.portal_client_id()
    AND workspace_id = app.current_workspace_id()
    AND EXISTS (
      SELECT 1 FROM progress_shares s
      WHERE s.client_id = measurements.client_id AND s.type_id = measurements.type_id
    )
  );
CREATE POLICY measurements_client_insert ON measurements FOR INSERT TO fitcoach_app
  WITH CHECK (
    client_id = app.portal_client_id()
    AND workspace_id = app.current_workspace_id()
    AND app.workspace_is_writable()
    AND app.client_feature('progressSelfLogging')
    AND source = 'client'
    AND recorded_by_user_id = app.current_user_id()
    AND voided_at IS NULL
    AND EXISTS (
      SELECT 1 FROM progress_shares s
      WHERE s.client_id = measurements.client_id AND s.type_id = measurements.type_id
    )
  );
