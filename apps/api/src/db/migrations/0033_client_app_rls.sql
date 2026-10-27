-- Client app screens: client policies, client-facing views and the client's own writes (step 4.2,
-- PROMPT §9, §10.5, CLAUDE.md rules 7 and 20c). Documented in docs/rls.md, proven by
-- src/db/client-app.db.test.ts. Every client policy keys on app.portal_client_id(), which is set
-- only for a client session (migration 0031).

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

-- A per-client feature flag of the signed-in client (§8.3): workoutSelfLogging, checkIns, …
CREATE FUNCTION app.client_feature(flag text) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
  AS $$
    SELECT coalesce((
      SELECT (c.features ->> flag)::boolean FROM clients c
      WHERE c.id = app.portal_client_id() AND c.workspace_id = app.current_workspace_id()
    ), false)
  $$;
GRANT EXECUTE ON FUNCTION app.client_feature(text) TO fitcoach_app;

-- The signed-in client's workout, in progress, with self-logging on.
CREATE FUNCTION app.client_workout_in_progress(session_id uuid) RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
  AS $$
    SELECT app.client_feature('workoutSelfLogging') AND EXISTS (
      SELECT 1 FROM workout_sessions
      WHERE id = session_id AND client_id = app.portal_client_id()
        AND workspace_id = app.current_workspace_id() AND status = 'in_progress'
    )
  $$;
GRANT EXECUTE ON FUNCTION app.client_workout_in_progress(uuid) TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Reads: the client's own program, workouts, goals and their workspace's custom exercises.
-- The client API selects allow-listed columns (snapshot trainer notes and trainer feedback are
-- removed before they leave the API).
-- ---------------------------------------------------------------------------------------------
CREATE POLICY exercises_client_select ON exercises FOR SELECT TO fitcoach_app
  USING (app.portal_client_id() IS NOT NULL AND workspace_id = app.current_workspace_id());

CREATE POLICY client_program_assignments_client_select ON client_program_assignments FOR SELECT
  TO fitcoach_app
  USING (client_id = app.portal_client_id() AND workspace_id = app.current_workspace_id());

CREATE POLICY workout_sessions_client_select ON workout_sessions FOR SELECT TO fitcoach_app
  USING (client_id = app.portal_client_id() AND workspace_id = app.current_workspace_id());

CREATE POLICY workout_session_exercises_client_select ON workout_session_exercises FOR SELECT
  TO fitcoach_app
  USING (
    app.portal_client_id() IS NOT NULL
    AND workspace_id = app.current_workspace_id()
    AND EXISTS (SELECT 1 FROM workout_sessions s WHERE s.id = workout_session_id)
  );

CREATE POLICY workout_sets_client_select ON workout_sets FOR SELECT TO fitcoach_app
  USING (
    app.portal_client_id() IS NOT NULL
    AND workspace_id = app.current_workspace_id()
    AND EXISTS (SELECT 1 FROM workout_session_exercises e WHERE e.id = workout_session_exercise_id)
  );

CREATE POLICY client_goals_client_select ON client_goals FOR SELECT TO fitcoach_app
  USING (client_id = app.portal_client_id() AND workspace_id = app.current_workspace_id());

-- ---------------------------------------------------------------------------------------------
-- Writes: logging their own workout, only with self-logging on (§8.5, §9).
-- ---------------------------------------------------------------------------------------------
CREATE POLICY workout_sessions_client_update ON workout_sessions FOR UPDATE TO fitcoach_app
  USING (
    client_id = app.portal_client_id()
    AND workspace_id = app.current_workspace_id()
    AND app.workspace_is_writable()
    AND status IN ('planned', 'in_progress')
    AND app.client_feature('workoutSelfLogging')
  )
  WITH CHECK (
    client_id = app.portal_client_id()
    AND workspace_id = app.current_workspace_id()
    AND status IN ('in_progress', 'completed')
  );
GRANT UPDATE (client_feedback) ON workout_sessions TO fitcoach_app;

-- Column grants are per role, so who may change which column is enforced here: a client changes
-- only the lifecycle and their own feedback; a trainer never writes the client's feedback.
CREATE FUNCTION app.guard_workout_session_update() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF app.current_actor() = 'client' THEN
    IF NEW.trainer_feedback IS DISTINCT FROM OLD.trainer_feedback
      OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
      OR NEW.skip_reason IS DISTINCT FROM OLD.skip_reason
      OR NOT (
        NEW.status = OLD.status
        OR (OLD.status = 'planned' AND NEW.status = 'in_progress')
        OR (OLD.status = 'in_progress' AND NEW.status = 'completed')
      )
    THEN
      RAISE EXCEPTION 'clients may only start, log and finish their own workout'
        USING ERRCODE = '42501';
    END IF;
  ELSIF app.current_actor() = 'trainer'
    AND NEW.client_feedback IS DISTINCT FROM OLD.client_feedback THEN
    RAISE EXCEPTION 'the client''s feedback is theirs' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER workout_sessions_guard_update BEFORE UPDATE ON workout_sessions
  FOR EACH ROW EXECUTE FUNCTION app.guard_workout_session_update();

CREATE POLICY workout_session_exercises_client_insert ON workout_session_exercises FOR INSERT
  TO fitcoach_app
  WITH CHECK (
    workspace_id = app.current_workspace_id()
    AND app.workspace_is_writable()
    AND app.client_workout_in_progress(workout_session_id)
  );

CREATE POLICY workout_sets_client_insert ON workout_sets FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.current_workspace_id()
    AND app.workspace_is_writable()
    AND EXISTS (
      SELECT 1 FROM workout_session_exercises e
      WHERE e.id = workout_session_exercise_id
        AND app.client_workout_in_progress(e.workout_session_id)
    )
  );
CREATE POLICY workout_sets_client_update ON workout_sets FOR UPDATE TO fitcoach_app
  USING (
    workspace_id = app.current_workspace_id()
    AND app.workspace_is_writable()
    AND EXISTS (
      SELECT 1 FROM workout_session_exercises e
      WHERE e.id = workout_session_exercise_id
        AND app.client_workout_in_progress(e.workout_session_id)
    )
  )
  WITH CHECK (workspace_id = app.current_workspace_id());

-- The trainer turns per-client features on and off (§8.3).
GRANT UPDATE (features) ON clients TO fitcoach_app;

-- The client's own preferences: a narrow function, because a client UPDATE policy on clients
-- couldn't stop the role's other column grants (limitations, status…). Owned by the migration
-- owner; it only ever touches the signed-in client's row.
CREATE FUNCTION app.client_update_preferences(
  p_preferred_contact text, p_weight_unit text, p_length_unit text
) RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF app.portal_client_id() IS NULL THEN
    RAISE EXCEPTION 'only a signed-in client can change their preferences' USING ERRCODE = '42501';
  END IF;
  IF NOT app.workspace_is_writable() THEN
    RAISE EXCEPTION 'this workspace is read-only' USING ERRCODE = '42501';
  END IF;
  UPDATE clients
    SET preferred_contact = p_preferred_contact, weight_unit = p_weight_unit,
        length_unit = p_length_unit, updated_at = now()
    WHERE id = app.portal_client_id() AND workspace_id = app.current_workspace_id();
END
$$;
REVOKE ALL ON FUNCTION app.client_update_preferences(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.client_update_preferences(text, text, text) TO fitcoach_app;

-- The workspace's default units for a client who hasn't chosen their own (trainer_settings stays
-- trainer-only; only these two values leave it).
CREATE FUNCTION app.client_default_units() RETURNS TABLE (weight_unit text, length_unit text)
  LANGUAGE sql STABLE
  SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT s.weight_unit, s.length_unit FROM trainer_settings s
    WHERE app.portal_client_id() IS NOT NULL AND s.workspace_id = app.current_workspace_id()
  $$;
REVOKE ALL ON FUNCTION app.client_default_units() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.client_default_units() TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Client-facing views (§10.5): column restriction that RLS can't express. Owned by the migration
-- owner, so they read the base tables without the app role's policies; the WHERE clause limits
-- them to the signed-in client. security_barrier keeps caller predicates from running first.
-- ---------------------------------------------------------------------------------------------

-- Their appointments, without session notes, cancel reasons or who booked them.
CREATE VIEW client_portal_appointments WITH (security_barrier = true) AS
  SELECT a.id, a.workspace_id, a.client_id, a.kind, a.status, a.starts_at, a.ends_at,
         a.duration_min, a.timezone, a.location, a.meeting_url, a.late_cancel
  FROM appointments a
  WHERE a.client_id = app.portal_client_id() AND a.workspace_id = app.current_workspace_id();

-- Their packages: sessions left and expiry only, never prices, amounts or payments (rule 20c).
CREATE VIEW client_portal_packages WITH (security_barrier = true) AS
  SELECT p.id, p.workspace_id, p.client_id, p.name, p.kind, p.status, p.sessions_included,
         p.starts_on, p.expires_on, p.created_at,
         CASE WHEN p.kind = 'session_pack' AND p.sessions_included IS NOT NULL
           THEN p.sessions_included - coalesce((
             SELECT sum(l.sessions_used) FROM package_session_ledger l
             WHERE l.workspace_id = p.workspace_id AND l.package_id = p.id
           ), 0)::int
         END AS sessions_left
  FROM client_packages p
  WHERE p.client_id = app.portal_client_id() AND p.workspace_id = app.current_workspace_id();

REVOKE ALL ON client_portal_appointments, client_portal_packages FROM PUBLIC;
GRANT SELECT ON client_portal_appointments, client_portal_packages TO fitcoach_app;
