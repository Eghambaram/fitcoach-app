-- Program builder, assignments and planned sessions: RLS and grants (step 3.4, PROMPT §8.5,
-- §10.5). Expands 0024 (programs were read-only). Policies are documented in docs/rls.md and proven
-- by src/db/programs.db.test.ts. Global starter templates stay read-only for fitcoach_app.

CREATE TRIGGER client_program_assignments_set_updated_at BEFORE UPDATE ON client_program_assignments
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER workout_sessions_set_updated_at BEFORE UPDATE ON workout_sessions
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Programs: a trainer creates, edits and archives their own (never deletes: assignments point at
-- them). The builder saves a program whole, replacing its workouts and exercises.
-- ---------------------------------------------------------------------------------------------
CREATE POLICY programs_trainer_insert ON programs FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
  );
CREATE POLICY programs_trainer_update ON programs FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
GRANT INSERT ON programs TO fitcoach_app;
GRANT UPDATE (
  name, description, goal, duration_weeks, days_per_week, is_template, archived_at
) ON programs TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON programs FROM fitcoach_system;

CREATE POLICY program_workouts_trainer_insert ON program_workouts FOR INSERT TO fitcoach_app
  WITH CHECK (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable());
CREATE POLICY program_workouts_trainer_update ON program_workouts FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
CREATE POLICY program_workouts_trainer_delete ON program_workouts FOR DELETE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable());
GRANT INSERT, DELETE ON program_workouts TO fitcoach_app;
GRANT UPDATE (name, day_number, position, notes) ON program_workouts TO fitcoach_app;

CREATE POLICY program_exercises_trainer_insert ON program_exercises FOR INSERT TO fitcoach_app
  WITH CHECK (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable());
CREATE POLICY program_exercises_trainer_update ON program_exercises FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
CREATE POLICY program_exercises_trainer_delete ON program_exercises FOR DELETE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable());
GRANT INSERT, DELETE ON program_exercises TO fitcoach_app;
GRANT UPDATE (
  position, sets, reps_min, reps_max, duration_seconds, target_load_kg, rest_seconds,
  trainer_notes, client_instructions
) ON program_exercises TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Assignments: signed, from the trainer's own program; only an active one changes, and only to end.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE client_program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_program_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY client_program_assignments_trainer_select ON client_program_assignments FOR SELECT
  TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY client_program_assignments_trainer_insert ON client_program_assignments FOR INSERT
  TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
    AND status = 'active'
    AND (
      program_id IS NULL
      OR EXISTS (
        SELECT 1 FROM programs p
        WHERE p.id = program_id AND p.workspace_id = app.trainer_workspace_id()
      )
    )
  );
CREATE POLICY client_program_assignments_trainer_update ON client_program_assignments FOR UPDATE
  TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND status = 'active'
  )
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON client_program_assignments FROM fitcoach_app;
GRANT INSERT ON client_program_assignments TO fitcoach_app;
GRANT UPDATE (status, ended_at) ON client_program_assignments TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON client_program_assignments FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Planned sessions: generated by the trainer (and extended daily by the system job). Only planned
-- ones can be removed (when a program ends or is replaced); logging arrives in step 3.5.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY workout_sessions_trainer_select ON workout_sessions FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY workout_sessions_trainer_insert ON workout_sessions FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND status = 'planned'
  );
CREATE POLICY workout_sessions_trainer_delete ON workout_sessions FOR DELETE TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND status = 'planned'
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON workout_sessions FROM fitcoach_app;
GRANT INSERT, DELETE ON workout_sessions TO fitcoach_app;
REVOKE TRUNCATE ON workout_sessions FROM fitcoach_system;
