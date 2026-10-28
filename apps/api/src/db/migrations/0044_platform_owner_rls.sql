-- Platform owner MFA (step 6.1, PROMPT §12.2, §16.0, ADR-0062). Documented in docs/rls.md, proven by
-- src/db/platform.db.test.ts.

-- ---------------------------------------------------------------------------------------------
-- TOTP secrets and recovery codes: only the platform auth flow (fitcoach_system) reads or writes
-- them. The request role never sees them, whoever is signed in.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE platform_mfa ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_mfa FORCE ROW LEVEL SECURITY;
REVOKE ALL ON platform_mfa FROM fitcoach_app;
REVOKE TRUNCATE ON platform_mfa FROM fitcoach_system;

ALTER TABLE platform_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_recovery_codes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON platform_recovery_codes FROM fitcoach_app;
REVOKE TRUNCATE ON platform_recovery_codes FROM fitcoach_system;
