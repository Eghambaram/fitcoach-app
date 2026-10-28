import { SetMetadata } from "@nestjs/common";
import type { Actor } from "../request-context";

export const IS_PUBLIC = "fitcoach:isPublic";
export const ROLES = "fitcoach:roles";
export const ALLOW_INACTIVE_WORKSPACE = "fitcoach:allowInactiveWorkspace";
export const ALLOW_AAL1 = "fitcoach:allowAal1";
export const SKIP_CSRF = "fitcoach:skipCsrf";

/**
 * No session required (CLAUDE.md rule 2). Every public endpoint must also be rate-limited in its
 * service. A valid session cookie is still resolved, so e.g. logout knows who is leaving.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Which actors may call the route. Required on every non-public route — RolesGuard fails closed without it. */
export const Roles = (...roles: [Actor, ...Actor[]]) => SetMetadata(ROLES, roles);

/**
 * Still reachable when the trainer's workspace is pending approval, suspended or cancelled — for
 * account basics (me, sessions, logout) and, later, data export (§16.0).
 */
export const AllowInactiveWorkspace = () => SetMetadata(ALLOW_INACTIVE_WORKSPACE, true);

/**
 * Reachable by a platform owner session that hasn't passed its TOTP step yet (AAL1): the MFA setup
 * and verify endpoints, `me` and logout. Everything else needs AAL2 (PlatformMfaGuard, §12.2).
 */
export const AllowAal1 = () => SetMetadata(ALLOW_AAL1, true);

/**
 * For machine-to-machine endpoints that authenticate with a bearer token, never a cookie (e.g. the
 * db-backup heartbeat): CSRF is a browser-cookie attack, so the Origin check doesn't apply.
 * Never use it on a route that reads the session cookie.
 */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);
