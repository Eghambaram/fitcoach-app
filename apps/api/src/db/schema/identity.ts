import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, timestamps } from "./columns";
import { files } from "./files";
import { workspaces } from "./workspaces";

/** Identity & auth (PROMPT §4.4, §12.2). */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL only for a client who accepted an invite without an email on file (ADR-0055). */
    email: citext("email").unique("users_email_key"),
    /** argon2id; NULL for clients who only ever sign in by link/OTP (step 4.1). */
    passwordHash: text("password_hash"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    check("users_status", sql`${t.status} in ('active', 'disabled')`),
    check("users_email_length", sql`char_length(${t.email}) between 3 and 254`),
  ],
);

export const profiles = pgTable(
  "profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    displayName: text("display_name").notNull(),
    phoneE164: text("phone_e164"),
    /** Trainer photo (public bucket — it also appears on their public page). */
    avatarFileId: uuid("avatar_file_id").references(() => files.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("profiles_avatar_file_id_idx").on(t.avatarFileId),
    check("profiles_kind", sql`${t.kind} in ('trainer', 'client')`),
    check("profiles_display_name_length", sql`char_length(${t.displayName}) between 1 and 80`),
    check(
      "profiles_phone_e164",
      sql`${t.phoneE164} is null or ${t.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`,
    ),
  ],
);

/**
 * Opaque sessions (ADR-0007). The cookie holds 32 random bytes; only HMAC-SHA256(SESSION_SECRET, token)
 * is stored. `id` is a separate public identifier for the "active sessions" list.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique("sessions_token_hash_key"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actor: text("actor").notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    /**
     * The client a client session acts as (step 4.1). The composite FK to clients is added in
     * migration 0031 (declaring it here would import clients into identity, a cycle).
     */
    clientId: uuid("client_id"),
    /** Authenticator assurance level: 1 = password/OTP, 2 = + TOTP (platform owners, step 6.1). */
    aal: smallint("aal").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedReason: text("revoked_reason"),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_workspace_id_idx").on(t.workspaceId),
    index("sessions_client_id_idx").on(t.clientId),
    check(
      "sessions_client",
      sql`(${t.actor} = 'client') = (${t.clientId} is not null and ${t.workspaceId} is not null)`,
    ),
    index("sessions_expires_at_idx").on(t.expiresAt),
    check("sessions_actor", sql`${t.actor} in ('trainer', 'client', 'platform_owner')`),
    check("sessions_aal", sql`${t.aal} in (1, 2)`),
    check(
      "sessions_revoked_reason",
      sql`${t.revokedReason} is null or ${t.revokedReason} in ('logout', 'user_revoked', 'password_reset', 'password_changed', 'archived', 'suspended', 'admin_revoked')`,
    ),
    check(
      "sessions_user_agent_length",
      sql`${t.userAgent} is null or char_length(${t.userAgent}) <= 300`,
    ),
  ],
);

/** Single-use, expiring tokens (CLAUDE.md rule 12). Only the HMAC of the token is stored. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull().unique("auth_tokens_token_hash_key"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("auth_tokens_user_id_purpose_idx").on(t.userId, t.purpose),
    index("auth_tokens_expires_at_idx").on(t.expiresAt),
    check(
      "auth_tokens_purpose",
      sql`${t.purpose} in ('verify_email', 'reset_password', 'email_otp')`,
    ),
  ],
);
