-- Auth & workspace RLS, grants, triggers and reference data (step 1.3, PROMPT §4.4, §8.12, §8.3A, §10.5).
-- Policies are documented in docs/rls.md and proven by src/db/*.db.test.ts.

-- ---------------------------------------------------------------------------------------------
-- Context helpers
-- ---------------------------------------------------------------------------------------------

-- The session's workspace, but only when the actor is a trainer (clients get their own policies in 4.1).
CREATE FUNCTION app.trainer_workspace_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT CASE WHEN app.current_actor() = 'trainer' THEN app.current_workspace_id() END $$;

-- Writes require a workspace that isn't pending approval, suspended or cancelled (§16.0: suspension = read-only).
CREATE FUNCTION app.workspace_is_writable() RETURNS boolean
  LANGUAGE sql STABLE
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE id = app.current_workspace_id() AND status IN ('trialing', 'active', 'past_due')
    )
  $$;

GRANT EXECUTE ON FUNCTION app.trainer_workspace_id(), app.workspace_is_writable()
  TO fitcoach_app, fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------------------------
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER workspaces_set_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER trainer_settings_set_updated_at BEFORE UPDATE ON trainer_settings
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER workspace_plans_set_updated_at BEFORE UPDATE ON workspace_plans
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER message_templates_set_updated_at BEFORE UPDATE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();
CREATE TRIGGER package_presets_set_updated_at BEFORE UPDATE ON package_presets
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Identity: a user sees and updates only their own rows. Accounts are created pre-session
-- (signup) through SystemDb, so fitcoach_app can't INSERT or DELETE.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_self_select ON users FOR SELECT TO fitcoach_app
  USING (id = app.current_user_id());
CREATE POLICY users_self_update ON users FOR UPDATE TO fitcoach_app
  USING (id = app.current_user_id()) WITH CHECK (id = app.current_user_id());
REVOKE INSERT, DELETE, TRUNCATE ON users FROM fitcoach_app;
-- Status and verification are changed only by auth flows / the platform owner (SystemDb).
REVOKE UPDATE ON users FROM fitcoach_app;
GRANT UPDATE (password_hash) ON users TO fitcoach_app;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY profiles_self_select ON profiles FOR SELECT TO fitcoach_app
  USING (user_id = app.current_user_id());
CREATE POLICY profiles_self_update ON profiles FOR UPDATE TO fitcoach_app
  USING (user_id = app.current_user_id()) WITH CHECK (user_id = app.current_user_id());
REVOKE INSERT, DELETE, TRUNCATE ON profiles FROM fitcoach_app;
REVOKE UPDATE ON profiles FROM fitcoach_app;
GRANT UPDATE (display_name, phone_e164) ON profiles TO fitcoach_app;

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY sessions_self_select ON sessions FOR SELECT TO fitcoach_app
  USING (user_id = app.current_user_id());
CREATE POLICY sessions_self_revoke ON sessions FOR UPDATE TO fitcoach_app
  USING (user_id = app.current_user_id()) WITH CHECK (user_id = app.current_user_id());
REVOKE INSERT, DELETE, TRUNCATE ON sessions FROM fitcoach_app;
-- A user may only revoke their own sessions — never extend them.
REVOKE UPDATE ON sessions FROM fitcoach_app;
GRANT UPDATE (revoked_at, revoked_reason) ON sessions TO fitcoach_app;

-- Tokens are created and consumed only pre-session (SystemDb).
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens FORCE ROW LEVEL SECURITY;
REVOKE ALL ON auth_tokens FROM fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Workspace: the trainer sees their own workspace; settings writes need a writable workspace.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspaces_trainer_select ON workspaces FOR SELECT TO fitcoach_app
  USING (id = app.trainer_workspace_id());
CREATE POLICY workspaces_trainer_update ON workspaces FOR UPDATE TO fitcoach_app
  USING (id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (id = app.trainer_workspace_id());
REVOKE INSERT, DELETE, TRUNCATE ON workspaces FROM fitcoach_app;
-- Status and ownership change only through the platform owner (audited, SystemDb).
REVOKE UPDATE ON workspaces FROM fitcoach_app;
GRANT UPDATE (name, slug, city, coaching_modes, timezone, country, currency) ON workspaces TO fitcoach_app;

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_members_trainer_select ON workspace_members FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON workspace_members FROM fitcoach_app;

ALTER TABLE trainer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY trainer_settings_trainer_select ON trainer_settings FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
CREATE POLICY trainer_settings_trainer_update ON trainer_settings FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, DELETE, TRUNCATE ON trainer_settings FROM fitcoach_app;

-- Plans are global reference data, readable by everyone (incl. the public pricing page later).
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_plans_read_all ON subscription_plans FOR SELECT TO fitcoach_app
  USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON subscription_plans FROM fitcoach_app;

-- The trainer can read their plan; only the platform owner assigns it (SystemDb, audited).
ALTER TABLE workspace_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_plans_trainer_select ON workspace_plans FOR SELECT TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON workspace_plans FROM fitcoach_app;

-- Templates and presets: own rows + the global defaults (workspace_id NULL, read-only).
-- Defaults are reset by copying, never by deleting, so fitcoach_app has no DELETE.
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY message_templates_trainer_select ON message_templates FOR SELECT TO fitcoach_app
  USING (workspace_id IS NULL OR workspace_id = app.trainer_workspace_id());
CREATE POLICY message_templates_trainer_insert ON message_templates FOR INSERT TO fitcoach_app
  WITH CHECK (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable());
CREATE POLICY message_templates_trainer_update ON message_templates FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE DELETE, TRUNCATE ON message_templates FROM fitcoach_app;

ALTER TABLE package_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_presets FORCE ROW LEVEL SECURITY;
CREATE POLICY package_presets_trainer_select ON package_presets FOR SELECT TO fitcoach_app
  USING (workspace_id IS NULL OR workspace_id = app.trainer_workspace_id());
CREATE POLICY package_presets_trainer_insert ON package_presets FOR INSERT TO fitcoach_app
  WITH CHECK (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable());
CREATE POLICY package_presets_trainer_update ON package_presets FOR UPDATE TO fitcoach_app
  USING (workspace_id = app.trainer_workspace_id() AND app.workspace_is_writable())
  WITH CHECK (workspace_id = app.trainer_workspace_id());
REVOKE DELETE, TRUNCATE ON package_presets FROM fitcoach_app;

-- ---------------------------------------------------------------------------------------------
-- Platform & infrastructure tables: fitcoach_system only.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE platform_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_roles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON platform_roles FROM fitcoach_app;

ALTER TABLE beta_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_invites FORCE ROW LEVEL SECURITY;
REVOKE ALL ON beta_invites FROM fitcoach_app;

ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON email_outbox FROM fitcoach_app;

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries FORCE ROW LEVEL SECURITY;
REVOKE ALL ON notification_deliveries FROM fitcoach_app;

-- Product events: like audit_logs, the app may only record events for its own context and never read them.
ALTER TABLE product_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_events FORCE ROW LEVEL SECURITY;
CREATE POLICY product_events_insert_own_context ON product_events FOR INSERT TO fitcoach_app
  WITH CHECK (
    actor_kind = app.current_actor()
    AND user_id = app.current_user_id()
    AND workspace_id IS NOT DISTINCT FROM app.current_workspace_id()
  );
REVOKE SELECT, UPDATE, DELETE, TRUNCATE ON product_events FROM fitcoach_app;
REVOKE UPDATE, TRUNCATE ON product_events FROM fitcoach_system;

-- ---------------------------------------------------------------------------------------------
-- Expand: the step 1.2 tables can now reference users and workspaces.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_keys_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  ADD CONSTRAINT idempotency_keys_workspace_id_workspaces_id_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE;
CREATE INDEX idempotency_keys_workspace_id_idx ON idempotency_keys (workspace_id);
-- audit_logs deliberately has no FKs: history must outlive the rows it describes.

-- ---------------------------------------------------------------------------------------------
-- Reference data (production; PROMPT §10.6). Copied into each new workspace at signup.
-- ---------------------------------------------------------------------------------------------
INSERT INTO subscription_plans (id, name, max_active_clients) VALUES ('beta', 'Free beta', 50);

-- Short, friendly, English (D24). Only the placeholders listed in packages/shared/src/messaging.ts.
INSERT INTO message_templates (workspace_id, purpose, body) VALUES
  (NULL, 'follow_up', 'Hi {first_name}, this is {trainer_name}. Thanks for your enquiry! Would you like to book a trial session this week?'),
  (NULL, 'trial_confirmation', 'Hi {first_name}, your trial session with {trainer_name} is booked for {date} at {time}. See you there!'),
  (NULL, 'client_invite', 'Hi {first_name}, {trainer_name} has set up your FitCoach account to share your workouts and progress. Open this link to get started: {link}'),
  (NULL, 'payment_reminder', 'Hi {first_name}, a friendly reminder from {trainer_name}: {amount_due} is due for {package_name}. Thank you!'),
  (NULL, 'package_renewal', 'Hi {first_name}, you have {sessions_left} sessions left in {package_name}. Shall we renew so you don''t miss a session?'),
  (NULL, 'check_in_nudge', 'Hi {first_name}, a quick reminder to send today''s check-in. It takes under a minute: {link}'),
  (NULL, 'session_reminder', 'Hi {first_name}, a reminder that your session with {trainer_name} is on {date} at {time}.');

-- Common package shapes (§8.3A). No default prices: the trainer sets their own.
INSERT INTO package_presets (workspace_id, name, kind, sessions_included, duration_days, sessions_per_week, default_price_paise, sort_order) VALUES
  (NULL, '12 sessions', 'session_pack', 12, 42, NULL, NULL, 1),
  (NULL, 'Monthly unlimited', 'time_based', NULL, 30, NULL, NULL, 2),
  (NULL, '3 months online coaching', 'online_coaching', NULL, 90, NULL, NULL, 3);
