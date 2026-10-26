-- Exercise library and programs: triggers, RLS and grants (step 3.3, PROMPT §8.5, §10.5). Policies
-- are documented in docs/rls.md and proven by src/db/exercises.db.test.ts. Global rows
-- (workspace_id NULL) are reference data: readable by every trainer, writable by no app role.

CREATE TRIGGER exercises_set_updated_at BEFORE UPDATE ON exercises
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER programs_set_updated_at BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER program_workouts_set_updated_at BEFORE UPDATE ON program_workouts
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER program_exercises_set_updated_at BEFORE UPDATE ON program_exercises
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- A composite FK with a NULL workspace_id isn't checked, so these keep global and tenant rows
-- apart: a workout belongs to a program of the same workspace (or both global), a planned
-- exercise to a workout of the same workspace, and it may only use a global exercise or one of
-- its own workspace's (a global template only global ones).
CREATE FUNCTION app.check_program_workout() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM programs
    WHERE id = NEW.program_id AND workspace_id IS NOT DISTINCT FROM NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'program % is not in this workspace', NEW.program_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER program_workouts_check BEFORE INSERT OR UPDATE OF program_id, workspace_id
  ON program_workouts FOR EACH ROW EXECUTE FUNCTION app.check_program_workout();

CREATE FUNCTION app.check_program_exercise() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM program_workouts
    WHERE id = NEW.program_workout_id AND workspace_id IS NOT DISTINCT FROM NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'workout % is not in this workspace', NEW.program_workout_id
      USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM exercises
    WHERE id = NEW.exercise_id
      AND (workspace_id IS NULL OR workspace_id IS NOT DISTINCT FROM NEW.workspace_id)
  ) THEN
    RAISE EXCEPTION 'exercise % is not available in this workspace', NEW.exercise_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER program_exercises_check
  BEFORE INSERT OR UPDATE OF program_workout_id, exercise_id, workspace_id
  ON program_exercises FOR EACH ROW EXECUTE FUNCTION app.check_program_exercise();

-- ---------------------------------------------------------------------------------------------
-- Exercises: the global library is read-only; a trainer adds, edits and archives their own.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises FORCE ROW LEVEL SECURITY;
CREATE POLICY exercises_select ON exercises FOR SELECT TO fitcoach_app
  USING (workspace_id IS NULL OR workspace_id = app.trainer_workspace_id());
CREATE POLICY exercises_trainer_insert ON exercises FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
    AND substitution_ids = '{}'::uuid[]
  );
CREATE POLICY exercises_trainer_update ON exercises FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON exercises FROM fitcoach_app;
GRANT INSERT ON exercises TO fitcoach_app;
GRANT UPDATE (
  name, category, muscle_groups, equipment, difficulty, instructions, safety_notes, media_url,
  archived_at
) ON exercises TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON exercises FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Programs: global starter templates are readable by every trainer. The builder (step 3.4) adds
-- the policies and grants for a workspace's own programs; until then fitcoach_app only reads.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs FORCE ROW LEVEL SECURITY;
CREATE POLICY programs_select ON programs FOR SELECT TO fitcoach_app
  USING (workspace_id IS NULL OR workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON programs FROM fitcoach_app;

ALTER TABLE program_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_workouts FORCE ROW LEVEL SECURITY;
CREATE POLICY program_workouts_select ON program_workouts FOR SELECT TO fitcoach_app
  USING (workspace_id IS NULL OR workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON program_workouts FROM fitcoach_app;

ALTER TABLE program_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_exercises FORCE ROW LEVEL SECURITY;
CREATE POLICY program_exercises_select ON program_exercises FOR SELECT TO fitcoach_app
  USING (workspace_id IS NULL OR workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON program_exercises FROM fitcoach_app;
