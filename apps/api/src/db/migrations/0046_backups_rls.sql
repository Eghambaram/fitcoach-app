-- Backup heartbeats (step 6.2, PROMPT §17.2, ADR-0063). Documented in docs/rls.md, proven by
-- src/modules/backups/backups.api.test.ts.

-- Written by the heartbeat endpoint and read by the Platform Health page, both as fitcoach_system.
-- History: no UPDATE or DELETE, not even for the system role.
ALTER TABLE backup_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON backup_runs FROM fitcoach_app;
REVOKE UPDATE, DELETE, TRUNCATE ON backup_runs FROM fitcoach_system;
