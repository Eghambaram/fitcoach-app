-- Scheduling: ends_at trigger, overlap exclusion, RLS and grants (step 2.6, PROMPT §8.6, §10.3,
-- §10.5). Policies are documented in docs/rls.md and proven by src/db/scheduling.db.test.ts.

CREATE TRIGGER appointment_series_set_updated_at BEFORE UPDATE ON appointment_series
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER appointments_set_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ends_at = starts_at + duration. A generated column can't do this (timestamptz + interval isn't
-- immutable), so a trigger keeps it, whatever the caller sends.
CREATE FUNCTION app.set_appointment_ends_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  NEW.ends_at := NEW.starts_at + make_interval(mins => NEW.duration_min);
  RETURN NEW;
END
$$;

CREATE TRIGGER appointments_set_ends_at BEFORE INSERT OR UPDATE OF starts_at, duration_min, ends_at
  ON appointments FOR EACH ROW EXECUTE FUNCTION app.set_appointment_ends_at();

-- No double-booking (§10.3): live appointments of one workspace may not overlap. Violations are
-- SQLSTATE 23P01, mapped to CONFLICT_APPOINTMENT.
ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (workspace_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
  WHERE (status IN ('scheduled', 'confirmed'));

-- ---------------------------------------------------------------------------------------------
-- Series: the trainer's own workspace, signed; the pattern can be edited or ended, never deleted.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE appointment_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_series FORCE ROW LEVEL SECURITY;
CREATE POLICY appointment_series_trainer_select ON appointment_series FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY appointment_series_trainer_insert ON appointment_series FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
    AND status = 'active'
  );
CREATE POLICY appointment_series_trainer_update ON appointment_series FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON appointment_series FROM fitcoach_app;
GRANT INSERT ON appointment_series TO fitcoach_app;
GRANT UPDATE (start_time, duration_min, location, meeting_url, status) ON appointment_series
  TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Appointments: booked live by the trainer, signed. A cancelled appointment is final. Never
-- deleted (history and, from step 3.2, the package ledger point at them).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;
CREATE POLICY appointments_trainer_select ON appointments FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY appointments_trainer_insert ON appointments FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
    AND status IN ('scheduled', 'confirmed')
  );
CREATE POLICY appointments_trainer_update ON appointments FOR UPDATE TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND status <> 'cancelled'
  )
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON appointments FROM fitcoach_app;
GRANT INSERT ON appointments TO fitcoach_app;
GRANT UPDATE (
  starts_at, duration_min, location, meeting_url, notes, status, cancelled_at, cancel_reason,
  late_cancel, attendance_marked_at
) ON appointments TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON appointments FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- History: insert-only for everyone, signed as the trainer.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE appointment_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY appointment_changes_trainer_select ON appointment_changes FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY appointment_changes_trainer_insert ON appointment_changes FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND actor_user_id = app.current_user_id()
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON appointment_changes FROM fitcoach_app;
GRANT INSERT ON appointment_changes TO fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON appointment_changes FROM fitcoach_system;
