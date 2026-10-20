import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, timestamps } from "./columns";
import { users } from "./identity";

/** Workspace = tenant; one per trainer in the MVP (PROMPT D5, §4.4). */
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    slug: citext("slug").notNull().unique("workspaces_slug_key"),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    city: text("city"),
    coachingModes: text("coaching_modes").array().notNull(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    country: text("country").notNull().default("IN"),
    currency: text("currency").notNull().default("INR"),
    ...timestamps,
  },
  (t) => [
    index("workspaces_owner_user_id_idx").on(t.ownerUserId),
    check(
      "workspaces_status",
      sql`${t.status} in ('pending_approval', 'trialing', 'active', 'past_due', 'suspended', 'cancelled')`,
    ),
    check(
      "workspaces_slug_format",
      sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${t.slug}) between 3 and 40`,
    ),
    check("workspaces_name_length", sql`char_length(${t.name}) between 2 and 80`),
    check("workspaces_city_length", sql`${t.city} is null or char_length(${t.city}) <= 80`),
    check(
      "workspaces_coaching_modes",
      sql`cardinality(${t.coachingModes}) between 1 and 3 and ${t.coachingModes} <@ array['in_person', 'online', 'hybrid']::text[]`,
    ),
    check("workspaces_country", sql`${t.country} ~ '^[A-Z]{2}$'`),
    check("workspaces_currency", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    // One workspace per trainer until Studio exists (D5).
    unique("workspace_members_user_id_key").on(t.userId),
    check("workspace_members_role", sql`${t.role} in ('owner')`),
  ],
);

/** Per-workspace settings incl. the D25 no-show / late-cancel policy and attention thresholds. */
export const trainerSettings = pgTable(
  "trainer_settings",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    weightUnit: text("weight_unit").notNull().default("kg"),
    lengthUnit: text("length_unit").notNull().default("cm"),
    noShowUsesSession: boolean("no_show_uses_session").notNull().default(true),
    lateCancelWindowHours: integer("late_cancel_window_hours").notNull().default(12),
    lateCancelUsesSession: boolean("late_cancel_uses_session").notNull().default(true),
    lowSessionsThreshold: integer("low_sessions_threshold").notNull().default(2),
    expiryWarningDays: integer("expiry_warning_days").notNull().default(7),
    ...timestamps,
  },
  (t) => [
    check("trainer_settings_weight_unit", sql`${t.weightUnit} in ('kg', 'lb')`),
    check("trainer_settings_length_unit", sql`${t.lengthUnit} in ('cm', 'in')`),
    check("trainer_settings_late_cancel_window", sql`${t.lateCancelWindowHours} between 0 and 168`),
    check("trainer_settings_low_sessions", sql`${t.lowSessionsThreshold} between 0 and 50`),
    check("trainer_settings_expiry_warning", sql`${t.expiryWarningDays} between 0 and 60`),
  ],
);

/** Global reference data: plans (`beta` is seeded). Entitlement editing is v1.1 (D12). */
export const subscriptionPlans = pgTable(
  "subscription_plans",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    maxActiveClients: integer("max_active_clients"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("subscription_plans_id_format", sql`${t.id} ~ '^[a-z0-9_]{2,40}$'`),
    check(
      "subscription_plans_max_active_clients",
      sql`${t.maxActiveClients} is null or ${t.maxActiveClients} > 0`,
    ),
  ],
);

/** The manual plan assignment for a workspace (set at signup, changed by the platform owner — audited). */
export const workspacePlans = pgTable(
  "workspace_plans",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => subscriptionPlans.id),
    maxActiveClients: integer("max_active_clients").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("workspace_plans_plan_id_idx").on(t.planId),
    index("workspace_plans_assigned_by_user_id_idx").on(t.assignedByUserId),
    check("workspace_plans_max_active_clients", sql`${t.maxActiveClients} > 0`),
  ],
);

/**
 * WhatsApp message templates (§8.12, D20). Rows with workspace_id NULL are the global defaults
 * (reference data, read-only); signup copies them into the new workspace.
 */
export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("message_templates_workspace_purpose_key")
      .on(t.workspaceId, t.purpose)
      .nullsNotDistinct(),
    check(
      "message_templates_purpose",
      sql`${t.purpose} in ('follow_up', 'trial_confirmation', 'client_invite', 'payment_reminder', 'package_renewal', 'check_in_nudge', 'session_reminder')`,
    ),
    check("message_templates_body_length", sql`char_length(${t.body}) between 1 and 1000`),
  ],
);

/**
 * Reusable package definitions (§8.3A). workspace_id NULL = global defaults copied at signup.
 * Defaults carry no price: prices are the trainer's to set (no invented numbers, CLAUDE.md rule 20).
 */
export const packagePresets = pgTable(
  "package_presets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    sessionsIncluded: integer("sessions_included"),
    durationDays: integer("duration_days"),
    /** Informational only for time-based packages (ADR-0031). */
    sessionsPerWeek: integer("sessions_per_week"),
    defaultPricePaise: bigint("default_price_paise", { mode: "bigint" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("package_presets_workspace_id_idx").on(t.workspaceId),
    check(
      "package_presets_kind",
      sql`${t.kind} in ('session_pack', 'time_based', 'online_coaching')`,
    ),
    check("package_presets_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check(
      "package_presets_sessions_included",
      sql`${t.sessionsIncluded} is null or ${t.sessionsIncluded} > 0`,
    ),
    check(
      "package_presets_session_pack_needs_sessions",
      sql`${t.kind} <> 'session_pack' or ${t.sessionsIncluded} is not null`,
    ),
    check(
      "package_presets_duration_days",
      sql`${t.durationDays} is null or ${t.durationDays} between 1 and 730`,
    ),
    check(
      "package_presets_sessions_per_week",
      sql`${t.sessionsPerWeek} is null or ${t.sessionsPerWeek} between 1 and 14`,
    ),
    check(
      "package_presets_price",
      sql`${t.defaultPricePaise} is null or ${t.defaultPricePaise} >= 0`,
    ),
  ],
);
