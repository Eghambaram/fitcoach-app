-- Client portal access: invite links, client sessions and the first client policies (step 4.1,
-- PROMPT D19, §8.3, §12.2, §10.5). Policies are documented in docs/rls.md and proven by
-- src/db/client-portal.db.test.ts. Clients only ever see their own client row and the workspace and
-- trainer they belong to; everything else stays trainer-only (CLAUDE.md rule 7).

-- A client session acts as one client of one workspace (declared here, not in Drizzle: it would make
-- identity.ts import clients.ts). Deleting the client deletes its sessions.
ALTER TABLE sessions ADD CONSTRAINT sessions_client_fk FOREIGN KEY (workspace_id, client_id)
  REFERENCES clients (workspace_id, id) ON DELETE CASCADE;

-- The session's client, but only when the actor is a client (like app.trainer_workspace_id()).
CREATE FUNCTION app.portal_client_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT CASE WHEN app.current_actor() = 'client' THEN app.current_client_id() END $$;
GRANT EXECUTE ON FUNCTION app.portal_client_id() TO fitcoach_app, fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Invite links: the trainer creates and revokes them; accepting is pre-session (SystemDb).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE client_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invites FORCE ROW LEVEL SECURITY;
CREATE POLICY client_invites_trainer_select ON client_invites FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY client_invites_trainer_insert ON client_invites FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_by_user_id = app.current_user_id()
    AND consumed_at IS NULL
    AND revoked_at IS NULL
  );
-- Only revoking an open link.
CREATE POLICY client_invites_trainer_revoke ON client_invites FOR UPDATE TO fitcoach_app
  USING (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND consumed_at IS NULL
    AND revoked_at IS NULL
  )
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON client_invites FROM fitcoach_app;
GRANT INSERT ON client_invites TO fitcoach_app;
GRANT UPDATE (revoked_at) ON client_invites TO fitcoach_app;
REVOKE DELETE, TRUNCATE ON client_invites FROM fitcoach_system;

-- The trainer turns portal access off and on.
GRANT UPDATE (portal_revoked_at) ON clients TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Client sessions: read-only access to their own client row, their workspace and its trainer.
-- The client API selects allow-listed columns only (never limitations or attribution).
-- ---------------------------------------------------------------------------------------------
CREATE POLICY clients_client_select ON clients FOR SELECT TO fitcoach_app
  USING (id = app.portal_client_id() AND workspace_id = app.current_workspace_id());

CREATE POLICY workspaces_client_select ON workspaces FOR SELECT TO fitcoach_app
  USING (app.portal_client_id() IS NOT NULL AND id = app.current_workspace_id());

CREATE POLICY workspace_members_client_select ON workspace_members FOR SELECT TO fitcoach_app
  USING (app.portal_client_id() IS NOT NULL AND workspace_id = app.current_workspace_id());

-- The trainer's name and photo (shown in the portal, and on their public page anyway).
CREATE POLICY profiles_client_select_trainer ON profiles FOR SELECT TO fitcoach_app
  USING (
    app.portal_client_id() IS NOT NULL
    AND kind = 'trainer'
    AND user_id IN (
      SELECT m.user_id FROM workspace_members m WHERE m.workspace_id = app.current_workspace_id()
    )
  );

-- Only the trainer's photo (public bucket); never another client's avatar.
CREATE POLICY files_client_select_trainer_avatar ON files FOR SELECT TO fitcoach_app
  USING (
    app.portal_client_id() IS NOT NULL
    AND workspace_id = app.current_workspace_id()
    AND kind = 'trainer_avatar'
  );
