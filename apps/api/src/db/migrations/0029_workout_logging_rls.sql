-- Live workout logging: triggers, RLS and grants (step 3.5, PROMPT §8.5, §10.5). Expands 0027
-- (workout_sessions could only be inserted and deleted while planned). Policies are documented in
-- docs/rls.md and proven by src/db/workouts.db.test.ts.

CREATE TRIGGER workout_session_exercises_set_updated_at BEFORE UPDATE ON workout_session_exercises
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER workout_sets_set_updated_at BEFORE UPDATE ON workout_sets
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- A logged exercise may only be a global exercise or one of its own workspace's (the composite FK
-- can't express "global or mine"). A linked appointment must belong to the same client.
CREATE FUNCTION app.check_workout_session_exercise() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM exercises
    WHERE id = NEW.exercise_id AND (workspace_id IS NULL OR workspace_id = NEW.workspace_id)
  ) THEN
    RAISE EXCEPTION 'exercise % is not available in this workspace', NEW.exercise_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER workout_session_exercises_check
  BEFORE INSERT OR UPDATE OF exercise_id, workspace_id
  ON workout_session_exercises FOR EACH ROW EXECUTE FUNCTION app.check_workout_session_exercise();

CREATE FUNCTION app.check_workout_session_appointment() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NEW.appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM appointments
    WHERE id = NEW.appointment_id AND workspace_id = NEW.workspace_id
      AND client_id = NEW.client_id
  ) THEN
    RAISE EXCEPTION 'appointment % is not this client''s', NEW.appointment_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER workout_sessions_appointment_check
  BEFORE INSERT OR UPDATE OF appointment_id, client_id
  ON workout_sessions FOR EACH ROW EXECUTE FUNCTION app.check_workout_session_appointment();

-- Is this workout in progress in the trainer's workspace? (SECURITY INVOKER: the caller's RLS
-- still applies, so another workspace's session is simply not found.)
CREATE FUNCTION app.workout_in_progress(session_id uuid) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE id = session_id AND workspace_id = app.trainer_workspace_id()
        AND status = 'in_progress'
    )
  $$;
GRANT EXECUTE ON FUNCTION app.workout_in_progress(uuid) TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Sessions: the trainer starts, finishes or skips a planned or in-progress workout. Finished and
-- skipped workouts are history: no further updates.
-- ---------------------------------------------------------------------------------------------
CREATE POLICY workout_sessions_trainer_update ON workout_sessions FOR UPDATE TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND status IN ('planned', 'in_progress')
  )
  WITH CHECK (workspace_id = app.trainer_workspace_id());
GRANT UPDATE (
  status, started_at, completed_at, appointment_id, trainer_feedback, skip_reason
) ON workout_sessions TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Logged exercises and sets: written only while their workout is in progress; never deleted.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE workout_session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_session_exercises FORCE ROW LEVEL SECURITY;
CREATE POLICY workout_session_exercises_trainer_select ON workout_session_exercises FOR SELECT
  TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY workout_session_exercises_trainer_insert ON workout_session_exercises FOR INSERT
  TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND app.workout_in_progress(workout_session_id)
  );
CREATE POLICY workout_session_exercises_trainer_update ON workout_session_exercises FOR UPDATE
  TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND app.workout_in_progress(workout_session_id)
  )
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON workout_session_exercises FROM fitcoach_app;
GRANT INSERT ON workout_session_exercises TO fitcoach_app;
GRANT UPDATE (exercise_id) ON workout_session_exercises TO fitcoach_app;
REVOKE TRUNCATE ON workout_session_exercises FROM fitcoach_system;

ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sets FORCE ROW LEVEL SECURITY;
CREATE POLICY workout_sets_trainer_select ON workout_sets FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY workout_sets_trainer_insert ON workout_sets FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND EXISTS (
      SELECT 1 FROM workout_session_exercises e
      WHERE e.id = workout_session_exercise_id AND app.workout_in_progress(e.workout_session_id)
    )
  );
CREATE POLICY workout_sets_trainer_update ON workout_sets FOR UPDATE TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND EXISTS (
      SELECT 1 FROM workout_session_exercises e
      WHERE e.id = workout_session_exercise_id AND app.workout_in_progress(e.workout_session_id)
    )
  )
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON workout_sets FROM fitcoach_app;
GRANT INSERT ON workout_sets TO fitcoach_app;
GRANT UPDATE (reps, load_kg, duration_seconds, rpe, completed, completed_at) ON workout_sets
  TO fitcoach_app;
REVOKE TRUNCATE ON workout_sets FROM fitcoach_system;
