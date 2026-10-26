-- Packages, session ledger and payments: RLS and grants (step 3.2, PROMPT §8.3A, §10.5). Policies
-- are documented in docs/rls.md and proven by src/db/packages.db.test.ts. Clients get no policy:
-- their portal (step 4.1) reads sessions left and expiry through a client-scoped endpoint only,
-- never prices or payments (CLAUDE.md rule 20c).

CREATE TRIGGER client_packages_set_updated_at BEFORE UPDATE ON client_packages
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Packages: sold active by the trainer, signed. Only an active package changes, and only to be
-- closed (completed / expired / cancelled); what was sold is never rewritten.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE client_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_packages FORCE ROW LEVEL SECURITY;
CREATE POLICY client_packages_trainer_select ON client_packages FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY client_packages_trainer_insert ON client_packages FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
    AND status = 'active'
  );
CREATE POLICY client_packages_trainer_update ON client_packages FOR UPDATE TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND status = 'active'
  )
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON client_packages FROM fitcoach_app;
GRANT INSERT ON client_packages TO fitcoach_app;
GRANT UPDATE (status, closed_at, closed_reason) ON client_packages TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON client_packages FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Session ledger: insert-only for everyone (rule 20b), signed as the trainer.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE package_session_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_session_ledger FORCE ROW LEVEL SECURITY;
CREATE POLICY package_session_ledger_trainer_select ON package_session_ledger FOR SELECT
  TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY package_session_ledger_trainer_insert ON package_session_ledger FOR INSERT
  TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND actor_user_id = app.current_user_id()
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON package_session_ledger FROM fitcoach_app;
GRANT INSERT ON package_session_ledger TO fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON package_session_ledger FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Payments: insert-only for everyone (corrections are voiding rows), signed as the trainer.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY client_payments_trainer_select ON client_payments FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY client_payments_trainer_insert ON client_payments FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND recorded_by_user_id = app.current_user_id()
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON client_payments FROM fitcoach_app;
GRANT INSERT ON client_payments TO fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON client_payments FROM fitcoach_system;
