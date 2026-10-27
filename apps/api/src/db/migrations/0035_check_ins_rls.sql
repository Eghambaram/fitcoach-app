-- Check-ins (step 4.3, PROMPT §8.7, §10.5): the client submits and edits today's check-in; the
-- trainer reviews it. Documented in docs/rls.md, proven by src/db/check-ins.db.test.ts.

CREATE TRIGGER check_ins_set_updated_at BEFORE UPDATE ON check_ins
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Today in the session's workspace time zone ("one per client per local date", rule 19).
CREATE FUNCTION app.workspace_today() RETURNS date
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
  AS $$
    SELECT (now() AT TIME ZONE w.timezone)::date FROM workspaces w
    WHERE w.id = app.current_workspace_id()
  $$;
GRANT EXECUTE ON FUNCTION app.workspace_today() TO fitcoach_app;

-- Who may change what (column grants are per role): a client changes only their answers, and only
-- for today; an edit sends the check-in back for review and is counted. A trainer changes only the
-- review, signed as themselves.
CREATE FUNCTION app.guard_check_in_update() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF app.current_actor() = 'client' THEN
    IF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.reviewed_by_user_id IS DISTINCT FROM OLD.reviewed_by_user_id
      OR NEW.reply IS DISTINCT FROM OLD.reply
    THEN
      RAISE EXCEPTION 'clients can only change their own answers' USING ERRCODE = '42501';
    END IF;
    IF (NEW.feeling, NEW.energy, NEW.sleep, NEW.soreness, NEW.notes, NEW.workout_feedback)
      IS DISTINCT FROM
      (OLD.feeling, OLD.energy, OLD.sleep, OLD.soreness, OLD.notes, OLD.workout_feedback)
    THEN
      NEW.revisions := OLD.revisions + 1;
      NEW.reviewed_at := NULL;
      NEW.reviewed_by_user_id := NULL;
    END IF;
  ELSIF app.current_actor() = 'trainer' THEN
    IF (NEW.feeling, NEW.energy, NEW.sleep, NEW.soreness, NEW.notes, NEW.workout_feedback)
      IS DISTINCT FROM
      (OLD.feeling, OLD.energy, OLD.sleep, OLD.soreness, OLD.notes, OLD.workout_feedback)
    THEN
      RAISE EXCEPTION 'a check-in is the client''s own report' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER check_ins_guard_update BEFORE UPDATE ON check_ins
  FOR EACH ROW EXECUTE FUNCTION app.guard_check_in_update();

-- Keeps the values before each edit. SECURITY DEFINER: nobody inserts revisions directly.
CREATE FUNCTION app.record_check_in_revision() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NEW.revisions > OLD.revisions THEN
    INSERT INTO check_in_revisions (workspace_id, check_in_id, previous)
    VALUES (OLD.workspace_id, OLD.id, jsonb_build_object(
      'feeling', OLD.feeling, 'energy', OLD.energy, 'sleep', OLD.sleep,
      'soreness', OLD.soreness, 'notes', OLD.notes, 'workoutFeedback', OLD.workout_feedback,
      'updatedAt', OLD.updated_at
    ));
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION app.record_check_in_revision() FROM PUBLIC;
CREATE TRIGGER check_ins_record_revision AFTER UPDATE ON check_ins
  FOR EACH ROW EXECUTE FUNCTION app.record_check_in_revision();

-- ---------------------------------------------------------------------------------------------
-- check_ins
-- ---------------------------------------------------------------------------------------------
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins FORCE ROW LEVEL SECURITY;

CREATE POLICY check_ins_trainer_select ON check_ins FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY check_ins_trainer_review ON check_ins FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND (reviewed_by_user_id IS NULL OR reviewed_by_user_id = app.current_user_id())
  );

CREATE POLICY check_ins_client_select ON check_ins FOR SELECT TO fitcoach_app
  USING (client_id = app.portal_client_id() AND workspace_id = app.current_workspace_id());
CREATE POLICY check_ins_client_insert ON check_ins FOR INSERT TO fitcoach_app
  WITH CHECK (
    client_id = app.portal_client_id()
    AND workspace_id = app.current_workspace_id()
    AND app.workspace_is_writable()
    AND app.client_feature('checkIns')
    AND local_date = app.workspace_today()
    AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL AND reply IS NULL
    AND revisions = 0
  );
-- Same-day edits until local midnight.
CREATE POLICY check_ins_client_update ON check_ins FOR UPDATE TO fitcoach_app
  USING (
    client_id = app.portal_client_id()
    AND workspace_id = app.current_workspace_id()
    AND app.workspace_is_writable()
    AND app.client_feature('checkIns')
    AND local_date = app.workspace_today()
  )
  WITH CHECK (client_id = app.portal_client_id() AND local_date = app.workspace_today());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON check_ins FROM fitcoach_app;
GRANT INSERT ON check_ins TO fitcoach_app;
GRANT UPDATE (
  feeling, energy, sleep, soreness, notes, workout_feedback, reviewed_at, reviewed_by_user_id, reply
) ON check_ins TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON check_ins FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- check_in_revisions: written only by the trigger; the trainer can read them.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE check_in_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in_revisions FORCE ROW LEVEL SECURITY;
CREATE POLICY check_in_revisions_trainer_select ON check_in_revisions FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON check_in_revisions FROM fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON check_in_revisions FROM fitcoach_system;

-- The trainer picks each client's check-in days (§8.7).
GRANT UPDATE (check_in_days) ON clients TO fitcoach_app;

-- The workspace's default check-in frequency for a signed-in client (trainer_settings stays
-- trainer-only; only this value leaves it).
CREATE FUNCTION app.client_check_in_frequency() RETURNS text
  LANGUAGE sql STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT s.check_in_frequency FROM trainer_settings s
    WHERE app.portal_client_id() IS NOT NULL AND s.workspace_id = app.current_workspace_id()
  $$;
REVOKE ALL ON FUNCTION app.client_check_in_frequency() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.client_check_in_frequency() TO fitcoach_app;
