import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
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
    preferredContact: text("preferred_contact"),
    experienceLevel: text("experience_level"),
    equipment: text("equipment"),
    /** Injuries, limitations, notes: trainer-only, never shown in the client portal (§8.4). */
    limitations: text("limitations"),
    /** When onboarding finished (the client became active). */
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Check-in weekdays (1 = Monday … 7 = Sunday); NULL = the workspace default (§8.7). */
    checkInDays: smallint("check_in_days").array(),
    /** The client's own display units in the portal (step 4.2); NULL = the workspace default. */
    weightUnit: text("weight_unit"),
    lengthUnit: text("length_unit"),
    /** The trainer turned off portal access (step 4.1); a new invite clears it. */
    portalRevokedAt: timestamp("portal_revoked_at", { withTimezone: true }),
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
    check(
      "clients_check_in_days",
      sql`${t.checkInDays} is null or (cardinality(${t.checkInDays}) between 1 and 7 and ${t.checkInDays} <@ array[1,2,3,4,5,6,7]::smallint[])`,
    ),
    check("clients_weight_unit", sql`${t.weightUnit} is null or ${t.weightUnit} in ('kg', 'lb')`),
    check("clients_length_unit", sql`${t.lengthUnit} is null or ${t.lengthUnit} in ('cm', 'in')`),
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
      "clients_preferred_contact",
      sql`${t.preferredContact} is null or ${t.preferredContact} in ('whatsapp', 'phone', 'email')`,
    ),
    check(
      "clients_experience_level",
      sql`${t.experienceLevel} is null or ${t.experienceLevel} in ('beginner', 'intermediate', 'advanced')`,
    ),
    check(
      "clients_equipment_length",
      sql`${t.equipment} is null or char_length(${t.equipment}) <= 200`,
    ),
    check(
      "clients_limitations_length",
      sql`${t.limitations} is null or char_length(${t.limitations}) <= 1000`,
    ),
    check(
      "clients_onboarded",
      sql`${t.status} = 'onboarding_draft' or ${t.onboardedAt} is not null`,
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
    check(
      "activity_events_type",
      sql`${t.type} in ('lead_converted', 'client_onboarded', 'client_paused', 'client_resumed', 'client_archived', 'client_restored', 'package_sold', 'package_cancelled', 'payment_recorded', 'payment_voided', 'sessions_adjusted')`,
    ),
    check("activity_events_subject", sql`num_nonnulls(${t.leadId}, ${t.clientId}) >= 1`),
    check("activity_events_data_object", sql`jsonb_typeof(${t.data}) = 'object'`),
  ],
);

/**
 * Onboarding drafts (PROMPT §8.4): the wizard's answers so far, resumable with `?draft=`. `client_id`
 * is set for a client created by lead conversion. Finished drafts keep `finalized_at`; none are
 * deleted.
 */
export const clientOnboardingDrafts = pgTable(
  "client_onboarding_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    step: integer("step").notNull().default(1),
    data: jsonb("data").notNull().default({}),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "client_onboarding_drafts_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    // One open draft per client.
    uniqueIndex("client_onboarding_drafts_open_client_key")
      .on(t.workspaceId, t.clientId)
      .where(sql`${t.finalizedAt} is null and ${t.clientId} is not null`),
    index("client_onboarding_drafts_workspace_open_idx")
      .on(t.workspaceId, t.updatedAt)
      .where(sql`${t.finalizedAt} is null`),
    index("client_onboarding_drafts_created_by_user_id_idx").on(t.createdByUserId),
    check("client_onboarding_drafts_step", sql`${t.step} between 1 and 4`),
    check("client_onboarding_drafts_data_object", sql`jsonb_typeof(${t.data}) = 'object'`),
    check("client_onboarding_drafts_data_size", sql`octet_length(${t.data}::text) <= 16384`),
  ],
);

/** A client's goals (PROMPT §8.4): one active primary, optional secondary ones. */
export const clientGoals = pgTable(
  "client_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    clientId: uuid("client_id").notNull(),
    kind: text("kind").notNull(),
    goal: text("goal").notNull(),
    targetText: text("target_text"),
    targetDate: date("target_date"),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "client_goals_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    uniqueIndex("client_goals_active_primary_key")
      .on(t.clientId)
      .where(sql`${t.kind} = 'primary' and ${t.status} = 'active'`),
    index("client_goals_workspace_client_idx").on(t.workspaceId, t.clientId),
    index("client_goals_created_by_user_id_idx").on(t.createdByUserId),
    check("client_goals_kind", sql`${t.kind} in ('primary', 'secondary')`),
    check(
      "client_goals_goal",
      sql`${t.goal} in ('lose_weight', 'build_muscle', 'get_stronger', 'improve_fitness', 'sports_performance', 'other')`,
    ),
    check("client_goals_status", sql`${t.status} in ('active', 'achieved', 'dropped')`),
    check(
      "client_goals_target_text_length",
      sql`${t.targetText} is null or char_length(${t.targetText}) <= 200`,
    ),
  ],
);

/**
 * Consent records (PROMPT §8.4, §12.3): append-only; a withdrawal is a new row. Each keeps the
 * notice version and the exact text shown.
 */
export const clientConsents = pgTable(
  "client_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    clientId: uuid("client_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    noticeVersion: integer("notice_version").notNull(),
    noticeText: text("notice_text").notNull(),
    source: text("source").notNull(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "client_consents_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    index("client_consents_workspace_client_idx").on(t.workspaceId, t.clientId, t.kind),
    index("client_consents_actor_user_id_idx").on(t.actorUserId),
    check("client_consents_kind", sql`${t.kind} in ('data_processing', 'progress_photos')`),
    check("client_consents_status", sql`${t.status} in ('granted', 'declined', 'withdrawn')`),
    check("client_consents_notice_version", sql`${t.noticeVersion} > 0`),
    check(
      "client_consents_notice_text_length",
      sql`char_length(${t.noticeText}) between 20 and 2000`,
    ),
    check("client_consents_source", sql`${t.source} in ('onboarding', 'client_portal')`),
    check("client_consents_actor_kind", sql`${t.actorKind} in ('trainer', 'client')`),
  ],
);

/** Measurement types (PROMPT §8.8). Global seeded types have no workspace; custom types are v1.1. */
export const measurementTypes = pgTable(
  "measurement_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    unitKind: text("unit_kind").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("measurement_types_workspace_key").on(t.workspaceId, t.key).nullsNotDistinct(),
    check("measurement_types_key_format", sql`${t.key} ~ '^[a-z][a-z0-9_]{1,40}$'`),
    check("measurement_types_name_length", sql`char_length(${t.name}) between 1 and 60`),
    check(
      "measurement_types_unit_kind",
      sql`${t.unitKind} in ('mass', 'length', 'percent', 'count')`,
    ),
  ],
);

/**
 * Measurements (PROMPT §8.8, CLAUDE.md rule 16): append-only, canonical units (kg, cm, %). A
 * correction voids the row (`voided_at`, reason) and inserts a new one.
 */
export const measurements = pgTable(
  "measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    clientId: uuid("client_id").notNull(),
    typeId: uuid("type_id")
      .notNull()
      .references(() => measurementTypes.id),
    value: numeric("value", { precision: 9, scale: 2, mode: "number" }).notNull(),
    measuredOn: date("measured_on").notNull(),
    source: text("source").notNull(),
    note: text("note"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedByUserId: uuid("voided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "measurements_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    index("measurements_workspace_client_type_idx").on(
      t.workspaceId,
      t.clientId,
      t.typeId,
      t.measuredOn,
    ),
    index("measurements_type_id_idx").on(t.typeId),
    index("measurements_recorded_by_user_id_idx").on(t.recordedByUserId),
    index("measurements_voided_by_user_id_idx").on(t.voidedByUserId),
    check("measurements_value_positive", sql`${t.value} > 0`),
    check("measurements_source", sql`${t.source} in ('trainer', 'client')`),
    check("measurements_note_length", sql`${t.note} is null or char_length(${t.note}) <= 500`),
    check(
      "measurements_void",
      sql`(${t.voidedAt} is null) = (${t.voidReason} is null) and (${t.voidedAt} is null or ${t.voidedByUserId} is not null)`,
    ),
    check(
      "measurements_void_reason_length",
      sql`${t.voidReason} is null or char_length(${t.voidReason}) between 1 and 200`,
    ),
  ],
);

/** Private trainer notes about a client (PROMPT §8.3). Append-only; never shown to the client. */
export const clientNotes = pgTable(
  "client_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    clientId: uuid("client_id").notNull(),
    body: text("body").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "client_notes_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    index("client_notes_workspace_client_created_at_idx").on(
      t.workspaceId,
      t.clientId,
      t.createdAt,
    ),
    index("client_notes_author_user_id_idx").on(t.authorUserId),
    check("client_notes_body_length", sql`char_length(${t.body}) between 1 and 2000`),
  ],
);

/**
 * Client portal invite links (PROMPT §8.3, D19): 32 random bytes, only the HMAC is stored, single
 * use, 7-day expiry, revocable. A dedicated table rather than `auth_tokens`: the client may have no
 * login (or no email) until they accept, and the link belongs to a client in a workspace (ADR-0055).
 */
export const clientInvites = pgTable(
  "client_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    tokenHash: text("token_hash").notNull().unique("client_invites_token_hash_key"),
    channel: text("channel").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "client_invites_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    index("client_invites_workspace_client_idx").on(t.workspaceId, t.clientId, t.createdAt),
    index("client_invites_created_by_user_id_idx").on(t.createdByUserId),
    check("client_invites_channel", sql`${t.channel} in ('whatsapp', 'email')`),
    check("client_invites_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
    check("client_invites_closed_once", sql`${t.consumedAt} is null or ${t.revokedAt} is null`),
  ],
);

/**
 * Which metrics a client sees in their app (PROMPT §8.8): one row per shared measurement type.
 * Default nothing shared; unsharing removes the row.
 */
export const progressShares = pgTable(
  "progress_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    typeId: uuid("type_id")
      .notNull()
      .references(() => measurementTypes.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "progress_shares_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    unique("progress_shares_client_type_key").on(t.clientId, t.typeId),
    index("progress_shares_workspace_client_idx").on(t.workspaceId, t.clientId),
    index("progress_shares_type_id_idx").on(t.typeId),
    index("progress_shares_created_by_user_id_idx").on(t.createdByUserId),
  ],
);
