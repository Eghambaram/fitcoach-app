import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, timestamps } from "./columns";
import { users } from "./identity";
import { leads } from "./leads";
import { workspaces } from "./workspaces";

/**
 * Clients (PROMPT §8.3, §10.2). Created by lead conversion (step 2.4) or the onboarding wizard (step
 * 2.5) as `onboarding_draft`, activated when onboarding finishes. A trigger enforces the workspace's
 * active-client limit on every move to `active` (§10.3, ADR-0033).
 */
export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** The client's portal login, once they accept an invite (step 4.1). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    sourceLeadId: uuid("source_lead_id"),
    status: text("status").notNull().default("onboarding_draft"),
    fullName: text("full_name").notNull(),
    phoneE164: text("phone_e164"),
    email: citext("email"),
    goal: text("goal"),
    trainingMode: text("training_mode"),
    preferredSchedule: text("preferred_schedule"),
    location: text("location"),
    /** Attribution, copied from the lead. */
    source: text("source"),
    campaign: text("campaign"),
    referrer: text("referrer"),
    utm: jsonb("utm").notNull().default({}),
    dob: date("dob"),
    timezone: text("timezone"),
    coachingStartOn: date("coaching_start_on"),
    /** Per-client feature flags (§8.3): workout self-logging, check-ins, progress self-logging. */
    features: jsonb("features")
      .notNull()
      .default({ workoutSelfLogging: false, checkIns: true, progressSelfLogging: false }),
    emergencyContact: jsonb("emergency_contact"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    unique("clients_workspace_id_id_key").on(t.workspaceId, t.id),
    // Exactly one client per lead, even under concurrent conversions (§8.2, §10.3).
    unique("clients_workspace_source_lead_key").on(t.workspaceId, t.sourceLeadId),
    foreignKey({
      name: "clients_source_lead_fk",
      columns: [t.workspaceId, t.sourceLeadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }),
    uniqueIndex("clients_workspace_phone_key")
      .on(t.workspaceId, t.phoneE164)
      .where(sql`${t.status} <> 'archived' and ${t.phoneE164} is not null`),
    uniqueIndex("clients_workspace_email_key")
      .on(t.workspaceId, t.email)
      .where(sql`${t.status} <> 'archived' and ${t.email} is not null`),
    index("clients_workspace_status_idx").on(t.workspaceId, t.status),
    index("clients_user_id_idx").on(t.userId),
    index("clients_created_by_user_id_idx").on(t.createdByUserId),
    check(
      "clients_status",
      sql`${t.status} in ('onboarding_draft', 'active', 'paused', 'archived')`,
    ),
    check("clients_archived_at", sql`(${t.status} = 'archived') = (${t.archivedAt} is not null)`),
    check("clients_full_name_length", sql`char_length(${t.fullName}) between 1 and 80`),
    check(
      "clients_phone_e164",
      sql`${t.phoneE164} is null or ${t.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`,
    ),
    check("clients_email_length", sql`${t.email} is null or char_length(${t.email}) <= 254`),
    check(
      "clients_goal",
      sql`${t.goal} is null or ${t.goal} in ('lose_weight', 'build_muscle', 'get_stronger', 'improve_fitness', 'sports_performance', 'other')`,
    ),
    check(
      "clients_training_mode",
      sql`${t.trainingMode} is null or ${t.trainingMode} in ('in_person', 'online', 'hybrid')`,
    ),
    check(
      "clients_preferred_schedule_length",
      sql`${t.preferredSchedule} is null or char_length(${t.preferredSchedule}) <= 200`,
    ),
    check(
      "clients_location_length",
      sql`${t.location} is null or char_length(${t.location}) <= 120`,
    ),
    check(
      "clients_source",
      sql`${t.source} is null or ${t.source} in ('public_page', 'qr', 'instagram', 'whatsapp', 'facebook', 'google', 'website', 'referral', 'walk_in', 'other')`,
    ),
    check(
      "clients_campaign_length",
      sql`${t.campaign} is null or char_length(${t.campaign}) <= 100`,
    ),
    check(
      "clients_referrer_length",
      sql`${t.referrer} is null or char_length(${t.referrer}) <= 120`,
    ),
    check("clients_utm_object", sql`jsonb_typeof(${t.utm}) = 'object'`),
    check("clients_features_object", sql`jsonb_typeof(${t.features}) = 'object'`),
    check(
      "clients_emergency_contact_object",
      sql`${t.emergencyContact} is null or jsonb_typeof(${t.emergencyContact}) = 'object'`,
    ),
    check(
      "clients_timezone_length",
      sql`${t.timezone} is null or char_length(${t.timezone}) between 1 and 64`,
    ),
  ],
);

/**
 * Workspace-wide "recent activity" feed (PROMPT §8.1, §8.3): one row per notable event about a lead
 * or client. Insert-only. Ids and enums in `data`, never free text.
 */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    leadId: uuid("lead_id"),
    clientId: uuid("client_id"),
    data: jsonb("data").notNull().default({}),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "activity_events_lead_fk",
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "activity_events_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    index("activity_events_workspace_created_at_idx").on(t.workspaceId, t.createdAt),
    index("activity_events_workspace_lead_idx").on(t.workspaceId, t.leadId),
    index("activity_events_workspace_client_idx").on(t.workspaceId, t.clientId),
    index("activity_events_actor_user_id_idx").on(t.actorUserId),
    check("activity_events_type", sql`${t.type} in ('lead_converted')`),
    check("activity_events_subject", sql`num_nonnulls(${t.leadId}, ${t.clientId}) >= 1`),
    check("activity_events_data_object", sql`jsonb_typeof(${t.data}) = 'object'`),
  ],
);
