-- Client onboarding: reference data, triggers, RLS and grants (step 2.5, PROMPT §8.4, §8.8, §10.5).
-- Policies are documented in docs/rls.md and proven by src/db/onboarding.db.test.ts.

-- ---------------------------------------------------------------------------------------------
-- Reference data (production, §10.6): the global measurement types. Keys match
-- BASELINE_MEASUREMENTS in packages/shared/src/contracts/onboarding.ts. Canonical units: kg, cm, %.
-- ---------------------------------------------------------------------------------------------
INSERT INTO measurement_types (workspace_id, key, name, unit_kind, sort_order) VALUES
  (NULL, 'weight', 'Weight', 'mass', 1),
  (NULL, 'height', 'Height', 'length', 2),
  (NULL, 'body_fat', 'Body fat', 'percent', 3),
  (NULL, 'waist', 'Waist', 'length', 4),
  (NULL, 'chest', 'Chest', 'length', 5),
  (NULL, 'hips', 'Hips', 'length', 6);

CREATE TRIGGER client_onboarding_drafts_set_updated_at BEFORE UPDATE ON client_onboarding_drafts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- A measurement may only use a global type or one of its own workspace's (custom types are v1.1;
-- the plain FK alone would accept another workspace's type id).
CREATE FUNCTION app.check_measurement_type() RETURNS trigger
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

CREATE TRIGGER measurements_check_type BEFORE INSERT OR UPDATE OF type_id ON measurements
  FOR EACH ROW EXECUTE FUNCTION app.check_measurement_type();

-- ---------------------------------------------------------------------------------------------
-- Clients: onboarding edits the client's details and activates them (the limit trigger from 0014
-- still guards every move to `active`). Archiving and the client portal arrive in 3.1 and 4.1.
-- ---------------------------------------------------------------------------------------------
CREATE POLICY clients_trainer_update ON clients FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id() AND status <> 'archived');
GRANT UPDATE (
  full_name, phone_e164, email, goal, training_mode, preferred_schedule, location, dob,
  coaching_start_on, emergency_contact, preferred_contact, experience_level, equipment,
  limitations, status, onboarded_at
) ON clients TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Drafts: the trainer's own workspace; finished drafts are final. Never deleted.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE client_onboarding_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_onboarding_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY client_onboarding_drafts_trainer_select ON client_onboarding_drafts FOR SELECT
  TO fitcoach_app USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY client_onboarding_drafts_trainer_insert ON client_onboarding_drafts FOR INSERT
  TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
    AND finalized_at IS NULL
  );
CREATE POLICY client_onboarding_drafts_trainer_update ON client_onboarding_drafts FOR UPDATE
  TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND finalized_at IS NULL
  )
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON client_onboarding_drafts FROM fitcoach_app;
GRANT INSERT ON client_onboarding_drafts TO fitcoach_app;
GRANT UPDATE (step, data, finalized_at) ON client_onboarding_drafts TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Goals: added by the trainer. Status changes (achieved / dropped) arrive with the client detail.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE client_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_goals FORCE ROW LEVEL SECURITY;
CREATE POLICY client_goals_trainer_select ON client_goals FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY client_goals_trainer_insert ON client_goals FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON client_goals FROM fitcoach_app;
GRANT INSERT ON client_goals TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Consents: append-only for everyone; a trainer records them as themselves.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE client_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_consents FORCE ROW LEVEL SECURITY;
CREATE POLICY client_consents_trainer_select ON client_consents FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY client_consents_trainer_insert ON client_consents FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND actor_kind = 'trainer'
    AND actor_user_id = app.current_user_id()
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON client_consents FROM fitcoach_app;
GRANT INSERT ON client_consents TO fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON client_consents FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Measurement types: global (read by everyone signed in) + the workspace's own (v1.1).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE measurement_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_types FORCE ROW LEVEL SECURITY;
CREATE POLICY measurement_types_select ON measurement_types FOR SELECT TO fitcoach_app
  USING (workspace_id IS NULL OR workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON measurement_types FROM fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Measurements: append-only (rule 16). The only change allowed is voiding a live row, signed.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements FORCE ROW LEVEL SECURITY;
CREATE POLICY measurements_trainer_select ON measurements FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY measurements_trainer_insert ON measurements FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND source = 'trainer'
    AND recorded_by_user_id = app.current_user_id()
    AND voided_at IS NULL
  );
CREATE POLICY measurements_trainer_void ON measurements FOR UPDATE TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND voided_at IS NULL
  )
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND voided_at IS NOT NULL
    AND voided_by_user_id = app.current_user_id()
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON measurements FROM fitcoach_app;
GRANT INSERT ON measurements TO fitcoach_app;
GRANT UPDATE (voided_at, voided_by_user_id, void_reason) ON measurements TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON measurements FROM fitcoach_system;
