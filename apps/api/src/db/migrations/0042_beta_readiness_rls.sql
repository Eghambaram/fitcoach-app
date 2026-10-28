-- Feedback and data exports (step 5.3, PROMPT §16.0, §8.12, §10.5). Documented in docs/rls.md,
-- proven by src/db/beta.db.test.ts.

-- ---------------------------------------------------------------------------------------------
-- Feedback: a trainer sends it signed as themselves; only the platform owner (fitcoach_system)
-- reads and triages it.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback FORCE ROW LEVEL SECURITY;
CREATE POLICY feedback_trainer_insert ON feedback FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND user_id = app.current_user_id()
    AND status = 'open'
  );
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON feedback FROM fitcoach_app;
GRANT INSERT ON feedback TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON feedback FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Data exports: the trainer asks for one and sees their workspace's; the job (fitcoach_system)
-- fills them in. Allowed in a suspended workspace too ("export allowed", §16.0).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_exports FORCE ROW LEVEL SECURITY;
CREATE POLICY data_exports_trainer_select ON data_exports FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY data_exports_trainer_insert ON data_exports FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND requested_by_user_id = app.current_user_id()
    AND status = 'pending'
    AND object_key IS NULL
  );
REVOKE UPDATE, DELETE, TRUNCATE ON data_exports FROM fitcoach_app;
GRANT INSERT ON data_exports TO fitcoach_app;
REVOKE TRUNCATE ON data_exports FROM fitcoach_system;
