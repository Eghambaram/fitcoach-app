-- Notifications for trainers and clients, and job run outcomes (step 5.2, PROMPT §8.10, §13).
-- Documented in docs/rls.md, proven by src/db/notifications.db.test.ts. Jobs write through
-- fitcoach_system; request code may only notify within these narrow rules.

-- ---------------------------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------------------------

-- A client reads and marks read their own notices (trainers: 0008).
CREATE POLICY notifications_client_select ON notifications FOR SELECT TO fitcoach_app
  USING (
    app.portal_client_id() IS NOT NULL
    AND recipient_user_id = app.current_user_id()
    AND workspace_id = app.current_workspace_id()
  );
CREATE POLICY notifications_client_mark_read ON notifications FOR UPDATE TO fitcoach_app
  USING (
    app.portal_client_id() IS NOT NULL
    AND recipient_user_id = app.current_user_id()
    AND workspace_id = app.current_workspace_id()
  )
  WITH CHECK (recipient_user_id = app.current_user_id());

-- A trainer notifies their own clients of a new program or a session change.
CREATE POLICY notifications_trainer_notify_client ON notifications FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND type IN ('program_assigned', 'session_booked', 'session_changed', 'session_cancelled')
    AND recipient_user_id IN (
      SELECT c.user_id FROM clients c
      WHERE c.workspace_id = app.trainer_workspace_id() AND c.user_id IS NOT NULL
    )
    AND read_at IS NULL
  );

-- A client's check-in notifies their trainer (the workspace owner).
CREATE POLICY notifications_client_notify_trainer ON notifications FOR INSERT TO fitcoach_app
  WITH CHECK (
    app.portal_client_id() IS NOT NULL
    AND workspace_id = app.current_workspace_id()
    AND type = 'check_in_submitted'
    AND recipient_user_id = (
      SELECT w.owner_user_id FROM workspaces w WHERE w.id = app.current_workspace_id()
    )
    AND read_at IS NULL
  );
GRANT INSERT ON notifications TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON notifications FROM fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Job runs: written and read by the job runner (fitcoach_system) only.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON job_runs FROM fitcoach_app;
REVOKE UPDATE, TRUNCATE ON job_runs FROM fitcoach_system;
