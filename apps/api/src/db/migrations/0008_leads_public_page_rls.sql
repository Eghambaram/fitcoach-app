-- Public page, enquiry form, leads and notifications: backfill, triggers, RLS and grants
-- (step 2.1, PROMPT §8.2, §8.10, §8.12, §10.5). Policies are documented in docs/rls.md and proven by
-- src/db/leads.db.test.ts.

-- ---------------------------------------------------------------------------------------------
-- Backfill (before RLS is forced): every existing workspace gets an unpublished page and form v1.
-- New workspaces get both at signup (trainer-accounts.ts). The consent text must match
-- DEFAULT_CONSENT_TEXT in packages/shared/src/contracts/public-page.ts.
-- ---------------------------------------------------------------------------------------------
INSERT INTO trainer_public_pages (workspace_id, location)
SELECT id, city FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO lead_forms (workspace_id, version, consent_text, fields)
SELECT
  id,
  1,
  'I agree that this coach may contact me by phone, WhatsApp or email about my enquiry, and keep the details I share here for that purpose. I can ask for them to be deleted at any time.',
  '{"email": "optional", "schedule": true, "message": true}'::jsonb
FROM workspaces
ON CONFLICT (workspace_id, version) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------------------------
CREATE TRIGGER trainer_public_pages_set_updated_at BEFORE UPDATE ON trainer_public_pages
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Public page: the trainer edits their own; anonymous visitors read it only through the
-- public-page service (SystemDb, whitelisted columns of published pages).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE trainer_public_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_public_pages FORCE ROW LEVEL SECURITY;
CREATE POLICY trainer_public_pages_trainer_select ON trainer_public_pages FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY trainer_public_pages_trainer_update ON trainer_public_pages FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON trainer_public_pages FROM fitcoach_app;
GRANT UPDATE (headline, bio, location, coaching_types, is_published, published_at)
  ON trainer_public_pages TO fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Form versions are immutable: changes insert version n+1, never edit or delete an old one,
-- because consents point at them.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE lead_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_forms FORCE ROW LEVEL SECURITY;
CREATE POLICY lead_forms_trainer_select ON lead_forms FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY lead_forms_trainer_insert ON lead_forms FOR INSERT TO fitcoach_app
  WITH CHECK (
    workspace_id = app.trainer_workspace_id()
    AND created_by_user_id = app.current_user_id()
    AND app.workspace_is_writable()
  );
REVOKE UPDATE, DELETE, TRUNCATE ON lead_forms FROM fitcoach_app, fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Leads: in this step they're only created by the public enquiry (SystemDb). Manual entry,
-- editing and stage changes get their policies with the leads screens (step 2.2).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads FORCE ROW LEVEL SECURITY;
CREATE POLICY leads_trainer_select ON leads FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON leads FROM fitcoach_app;
REVOKE DELETE, TRUNCATE ON leads FROM fitcoach_system;

-- The timeline and consents are insert-only history for everyone.
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY lead_activities_trainer_select ON lead_activities FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON lead_activities FROM fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON lead_activities FROM fitcoach_system;

ALTER TABLE lead_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_consents FORCE ROW LEVEL SECURITY;
CREATE POLICY lead_consents_trainer_select ON lead_consents FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON lead_consents FROM fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON lead_consents FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Notifications: each user sees their own, in their own workspace, and may only mark them read.
-- Created by system work (enquiries now, pg-boss jobs in step 5.2).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_recipient_select ON notifications FOR SELECT TO fitcoach_app
  USING (recipient_user_id = app.current_user_id() AND workspace_id = app.trainer_workspace_id());
CREATE POLICY notifications_recipient_mark_read ON notifications FOR UPDATE TO fitcoach_app
  USING (recipient_user_id = app.current_user_id() AND workspace_id = app.trainer_workspace_id())
  WITH CHECK (recipient_user_id = app.current_user_id() AND workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON notifications FROM fitcoach_app;
GRANT UPDATE (read_at) ON notifications TO fitcoach_app;
