-- Follow-ups and the communication log: triggers, RLS and grants (step 2.3, PROMPT §8.2, §8.10,
-- §10.5). Policies are documented in docs/rls.md and proven by src/db/follow-ups.db.test.ts.

CREATE TRIGGER lead_follow_ups_set_updated_at BEFORE UPDATE ON lead_follow_ups
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Derived lead columns. Both triggers run as the caller (no SECURITY DEFINER), so the lead's own
-- RLS policies still apply: a trainer can only move their own, writable, unconverted leads.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION app.refresh_lead_next_follow_up() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  WITH next AS (
    SELECT min(f.due_at) AS due_at
    FROM lead_follow_ups f
    WHERE f.workspace_id = NEW.workspace_id AND f.lead_id = NEW.lead_id AND f.status = 'open'
  )
  UPDATE leads l
  SET next_follow_up_at = next.due_at
  FROM next
  WHERE l.workspace_id = NEW.workspace_id
    AND l.id = NEW.lead_id
    AND l.next_follow_up_at IS DISTINCT FROM next.due_at;
  RETURN NULL;
END
$$;

CREATE TRIGGER lead_follow_ups_refresh_lead AFTER INSERT OR UPDATE OF status, due_at
  ON lead_follow_ups FOR EACH ROW EXECUTE FUNCTION app.refresh_lead_next_follow_up();

CREATE FUNCTION app.touch_lead_last_contact() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  UPDATE leads
  SET last_contact_at = NEW.occurred_at
  WHERE workspace_id = NEW.workspace_id
    AND id = NEW.lead_id
    AND (last_contact_at IS NULL OR last_contact_at < NEW.occurred_at);
  RETURN NULL;
END
$$;

CREATE TRIGGER communication_logs_touch_lead AFTER INSERT ON communication_logs
  FOR EACH ROW EXECUTE FUNCTION app.touch_lead_last_contact();

GRANT UPDATE (next_follow_up_at, last_contact_at) ON leads TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Follow-ups: trainers schedule, reschedule and finish them in their writable workspace, signed as
-- themselves. Never deleted (only with their lead).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE lead_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_follow_ups FORCE ROW LEVEL SECURITY;
CREATE POLICY lead_follow_ups_trainer_select ON lead_follow_ups FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY lead_follow_ups_trainer_insert ON lead_follow_ups FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
    AND status = 'open'
  );
CREATE POLICY lead_follow_ups_trainer_update ON lead_follow_ups FOR UPDATE TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND status = 'open'
  )
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND (completed_by_user_id IS NULL OR completed_by_user_id = app.current_user_id())
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON lead_follow_ups FROM fitcoach_app;
GRANT INSERT ON lead_follow_ups TO fitcoach_app;
GRANT UPDATE (
  action_type, due_at, notes, reminder, status, outcome, outcome_note, completed_at,
  completed_by_user_id
) ON lead_follow_ups TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON lead_follow_ups FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Communication log: append-only for everyone, signed as the trainer who logged it.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY communication_logs_trainer_select ON communication_logs FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY communication_logs_trainer_insert ON communication_logs FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND actor_user_id = app.current_user_id()
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON communication_logs FROM fitcoach_app;
GRANT INSERT ON communication_logs TO fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON communication_logs FROM fitcoach_system;
