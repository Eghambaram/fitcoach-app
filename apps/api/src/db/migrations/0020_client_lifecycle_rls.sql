-- Client lifecycle and private notes: RLS and grants (step 3.1, PROMPT §8.3, §10.5). Policies are
-- documented in docs/rls.md and proven by src/db/client-lifecycle.db.test.ts.

-- ---------------------------------------------------------------------------------------------
-- Clients may now be archived and restored (active ↔ paused ↔ archived). The CHECK constraint
-- clients_archived_at keeps status and archived_at consistent; the limit trigger guards every
-- move to active. Hard delete stays impossible (§12.4 deletion workflow is v1.1).
-- ---------------------------------------------------------------------------------------------
DROP POLICY clients_trainer_update ON clients;
CREATE POLICY clients_trainer_update ON clients FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
GRANT UPDATE (archived_at) ON clients TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Private notes: append-only for everyone, signed as the trainer.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY client_notes_trainer_select ON client_notes FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY client_notes_trainer_insert ON client_notes FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND author_user_id = app.current_user_id()
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON client_notes FROM fitcoach_app;
GRANT INSERT ON client_notes TO fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON client_notes FROM fitcoach_system;
