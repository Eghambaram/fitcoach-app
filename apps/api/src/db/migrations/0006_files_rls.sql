-- Files ledger RLS and grants (step 1.5, PROMPT D11, §10.5, §17.7). See docs/rls.md.

ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE files FORCE ROW LEVEL SECURITY;

-- A trainer sees their workspace's files.
CREATE POLICY files_trainer_select ON files FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());

-- Uploads are recorded for the trainer's own workspace, by themselves, in a writable workspace.
CREATE POLICY files_trainer_insert ON files FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND uploaded_by_user_id = app.current_user_id()
    AND app.workspace_is_writable()
  );

-- Soft delete only (deleted_at); objects are purged by a fitcoach_system job after 7 days.
CREATE POLICY files_trainer_soft_delete ON files FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());

REVOKE UPDATE, DELETE, TRUNCATE ON files FROM fitcoach_app;
GRANT UPDATE (deleted_at) ON files TO fitcoach_app;
-- The ledger is never deleted from, only marked purged.
REVOKE DELETE, TRUNCATE ON files FROM fitcoach_system;

-- The app sets a trainer's photo — but only to a file that user uploaded and can see.
GRANT UPDATE (avatar_file_id) ON profiles TO fitcoach_app;

CREATE FUNCTION app.check_profile_avatar() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NEW.avatar_file_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.files
    WHERE id = NEW.avatar_file_id
      AND uploaded_by_user_id = NEW.user_id
      AND kind = 'trainer_avatar'
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'avatar file must be an active trainer_avatar uploaded by this user'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END
$$;

GRANT EXECUTE ON FUNCTION app.check_profile_avatar() TO fitcoach_app, fitcoach_system;

CREATE TRIGGER profiles_check_avatar
  BEFORE INSERT OR UPDATE OF avatar_file_id ON profiles
  FOR EACH ROW EXECUTE FUNCTION app.check_profile_avatar();
