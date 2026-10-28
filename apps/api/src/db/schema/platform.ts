import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/** Platform owner grants — only via `pnpm platform:grant` (audited). fitcoach_app can't read this table. */
export const platformRoles = pgTable(
  "platform_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    grantedBy: text("granted_by").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.role] }),
    check("platform_roles_role", sql`${t.role} in ('platform_owner')`),
  ],
);

/**
 * Platform owner TOTP (PROMPT §12.2, §16.0, ADR-0062). The secret is AES-256-GCM encrypted with
 * APP_ENCRYPTION_KEY; `enabled_at` is set once the first code is confirmed. `last_time_step` blocks
 * replaying a code. Only fitcoach_system touches this table.
 */
export const platformMfa = pgTable(
  "platform_mfa",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    secretCiphertext: text("secret_ciphertext").notNull(),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    lastTimeStep: bigint("last_time_step", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("platform_mfa_ciphertext_length", sql`char_length(${t.secretCiphertext}) <= 500`)],
);

/** One-time recovery codes for platform owner MFA. Only the HMAC is stored. */
export const platformRecoveryCodes = pgTable(
  "platform_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull().unique("platform_recovery_codes_code_hash_key"),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("platform_recovery_codes_user_id_idx").on(t.userId)],
);

/** Closed-beta signup codes (§1A.6, ADR-0029). Only the HMAC of the code is stored. */
export const betaInvites = pgTable(
  "beta_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeHash: text("code_hash").notNull().unique("beta_invites_code_hash_key"),
    /** Who the code is for, e.g. "Pune gym trainers" — not personal data. */
    label: text("label"),
    maxUses: integer("max_uses").notNull(),
    uses: integer("uses").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("beta_invites_max_uses", sql`${t.maxUses} between 1 and 1000`),
    check("beta_invites_uses", sql`${t.uses} between 0 and ${t.maxUses}`),
    check("beta_invites_label_length", sql`${t.label} is null or char_length(${t.label}) <= 80`),
  ],
);

/** Product analytics for the beta metrics (§1A.5, ADR-0030). No PII in `properties`. */
export const productEvents = pgTable(
  "product_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    event: text("event").notNull(),
    actorKind: text("actor_kind").notNull(),
    userId: uuid("user_id"),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    properties: jsonb("properties").notNull().default({}),
  },
  (t) => [
    index("product_events_event_occurred_at_idx").on(t.event, t.occurredAt),
    index("product_events_workspace_id_occurred_at_idx").on(t.workspaceId, t.occurredAt),
    check("product_events_event_format", sql`${t.event} ~ '^[a-z][a-z0-9_]{2,60}$'`),
    check(
      "product_events_actor_kind",
      sql`${t.actorKind} in ('trainer', 'client', 'platform_owner', 'system')`,
    ),
  ],
);

/** Emails captured by the `console` provider — local/test only, never in production (D13). */
export const emailOutbox = pgTable("email_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  toAddress: text("to_address").notNull(),
  subject: text("subject").notNull(),
  textBody: text("text_body").notNull(),
  htmlBody: text("html_body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per delivery attempt with the provider's answer — "sent" is only shown if a row exists (§8.10). */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: text("channel").notNull(),
    template: text("template").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notification_deliveries_user_id_idx").on(t.userId),
    index("notification_deliveries_workspace_id_idx").on(t.workspaceId),
    check("notification_deliveries_channel", sql`${t.channel} in ('email')`),
    check("notification_deliveries_status", sql`${t.status} in ('sent', 'failed')`),
    check(
      "notification_deliveries_error_length",
      sql`${t.error} is null or char_length(${t.error}) <= 500`,
    ),
  ],
);
