-- Clients, activity events and lead conversion: FKs, triggers, RLS and grants (step 2.4, PROMPT
-- §8.2, §8.3, §10.3, §10.5). Policies are documented in docs/rls.md and proven by
-- src/db/clients.db.test.ts.

-- A converted lead points at its client, in the same workspace.
ALTER TABLE leads ADD CONSTRAINT leads_converted_client_fk
  FOREIGN KEY (workspace_id, converted_client_id) REFERENCES clients (workspace_id, id);

CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Active-client limit (§10.3, ADR-0033): every move to `active` is checked against the
-- workspace's plan. The advisory lock serialises activations per workspace, so two concurrent
-- requests can't both take the last slot. Runs as the caller; RLS limits the count to the
-- caller's workspace, which is the one being changed.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION app.enforce_active_client_limit() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  max_active integer;
  active_count integer;
BEGIN
  IF NEW.status <> 'active' OR (TG_OP = 'UPDATE' AND OLD.status = 'active') THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('fitcoach:client-limit:' || NEW.workspace_id::text, 0));
  SELECT max_active_clients INTO max_active FROM workspace_plans WHERE workspace_id = NEW.workspace_id;
  IF max_active IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO active_count FROM clients
    WHERE workspace_id = NEW.workspace_id AND status = 'active' AND id <> NEW.id;
  IF active_count >= max_active THEN
    RAISE EXCEPTION 'active client limit of % reached', max_active USING ERRCODE = 'FC001';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER clients_enforce_active_limit BEFORE INSERT OR UPDATE OF status ON clients
  FOR EACH ROW EXECUTE FUNCTION app.enforce_active_client_limit();

-- ---------------------------------------------------------------------------------------------
-- Clients: trainers read and add clients in their writable workspace, signed as themselves.
-- Editing, status changes and the client's own portal access arrive with steps 2.5, 3.1 and 4.1.
-- Nobody hard-deletes a client (§12.4 deletion workflow is v1.1).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY clients_trainer_select ON clients FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY clients_trainer_insert ON clients FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
    AND user_id IS NULL
    AND status <> 'archived'
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON clients FROM fitcoach_app;
GRANT INSERT ON clients TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON clients FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Activity feed: insert-only, signed as the trainer.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events FORCE ROW LEVEL SECURITY;
CREATE POLICY activity_events_trainer_select ON activity_events FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY activity_events_trainer_insert ON activity_events FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND actor_user_id = app.current_user_id()
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON activity_events FROM fitcoach_app;
GRANT INSERT ON activity_events TO fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON activity_events FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Leads: `converted` may now be set, but only together with a client of the same workspace (the
-- composite FK) and signed by the caller. A converted lead is final: no further updates.
-- ---------------------------------------------------------------------------------------------
DROP POLICY leads_trainer_update ON leads;
CREATE POLICY leads_trainer_update ON leads FOR UPDATE TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND stage <> 'converted'
  )
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND (
      stage <> 'converted'
      OR (converted_client_id IS NOT NULL AND converted_by_user_id = app.current_user_id())
    )
  );
GRANT UPDATE (converted_client_id, converted_at, converted_by_user_id) ON leads TO fitcoach_app;
