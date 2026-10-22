-- Lead CRM write access for trainers (step 2.2, PROMPT §8.2, §10.5). See docs/rls.md; proven by
-- src/db/leads-crm.db.test.ts.

-- ---------------------------------------------------------------------------------------------
-- Leads: trainers add (manual only), edit, change stage, archive and delete untouched leads in
-- their writable workspace. Nobody but the conversion service (step 2.4) may set `converted`.
-- ---------------------------------------------------------------------------------------------
CREATE POLICY leads_trainer_insert ON leads FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND created_via = 'manual'
    AND created_by_user_id = app.current_user_id()
    AND stage <> 'converted'
  );
CREATE POLICY leads_trainer_update ON leads FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id() AND stage <> 'converted');
CREATE POLICY leads_trainer_delete ON leads FOR DELETE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable());

GRANT INSERT, DELETE ON leads TO fitcoach_app;
-- Workspace, origin (created_via, created_by), UTM data and the enquiry message are fixed after
-- creation; the source can be corrected ("how did they hear about you").
GRANT UPDATE (
  full_name, phone_e164, email, goal, training_mode, preferred_schedule, location,
  interested_service, source, referrer, campaign, stage, lost_reason, nurture_until, archived_at
) ON leads TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- The timeline stays insert-only; trainers may now add their own entries (edits, stage changes,
-- notes, archive/restore), always signed as themselves.
-- ---------------------------------------------------------------------------------------------
CREATE POLICY lead_activities_trainer_insert ON lead_activities FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND app.workspace_is_writable()
    AND actor_kind = 'trainer'
    AND actor_user_id = app.current_user_id()
    AND type <> 'enquiry_received'
  );
GRANT INSERT ON lead_activities TO fitcoach_app;
