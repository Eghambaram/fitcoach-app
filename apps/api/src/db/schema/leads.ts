import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { citext, timestamps } from "./columns";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/**
 * The trainer's public enquiry page `/coach/[slug]` (PROMPT §8.2, §8.12). One per workspace; the
 * name, slug, coaching modes and photo come from `profiles` / `workspaces`. Read publicly only through
 * the whitelisted read model in the public-page service.
 */
export const trainerPublicPages = pgTable(
  "trainer_public_pages",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    headline: text("headline"),
    bio: text("bio"),
    location: text("location"),
    coachingTypes: text("coaching_types")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isPublished: boolean("is_published").notNull().default(false),
    /** When the page was last published; kept while published. */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check(
      "trainer_public_pages_headline_length",
      sql`${t.headline} is null or char_length(${t.headline}) <= 120`,
    ),
    check(
      "trainer_public_pages_bio_length",
      sql`${t.bio} is null or char_length(${t.bio}) <= 1000`,
    ),
    check(
      "trainer_public_pages_location_length",
      sql`${t.location} is null or char_length(${t.location}) <= 120`,
    ),
    check("trainer_public_pages_coaching_types", sql`cardinality(${t.coachingTypes}) <= 8`),
    check(
      "trainer_public_pages_published_at",
      sql`not ${t.isPublished} or ${t.publishedAt} is not null`,
    ),
  ],
);

/**
 * Enquiry form versions (fields + consent wording). Rows are immutable: any change inserts version
 * n+1, and each lead's consent points at the exact version it agreed to (PROMPT §8.2, §12.3).
 */
export const leadForms = pgTable(
  "lead_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    consentText: text("consent_text").notNull(),
    /** `{ email: hidden|optional|required, schedule: boolean, message: boolean }`. */
    fields: jsonb("fields").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("lead_forms_workspace_version_key").on(t.workspaceId, t.version),
    unique("lead_forms_workspace_id_id_key").on(t.workspaceId, t.id),
    index("lead_forms_created_by_user_id_idx").on(t.createdByUserId),
    check("lead_forms_version", sql`${t.version} > 0`),
    check("lead_forms_consent_text_length", sql`char_length(${t.consentText}) between 20 and 1000`),
    check("lead_forms_fields_object", sql`jsonb_typeof(${t.fields}) = 'object'`),
  ],
);

/** Lead CRM (PROMPT §8.2). Columns for follow-ups, conversion and lost reasons arrive with their steps. */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    phoneE164: text("phone_e164"),
    email: citext("email"),
    goal: text("goal").notNull(),
    trainingMode: text("training_mode"),
    preferredSchedule: text("preferred_schedule"),
    /** The enquirer's own words, kept as written. */
    message: text("message"),
    source: text("source").notNull(),
    campaign: text("campaign"),
    utm: jsonb("utm").notNull().default({}),
    referrer: text("referrer"),
    location: text("location"),
    interestedService: text("interested_service"),
    stage: text("stage").notNull().default("new"),
    lostReason: text("lost_reason"),
    /** "Try again after" for lost leads (a local date, no time). */
    nurtureUntil: date("nurture_until"),
    createdVia: text("created_via").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    /** Archived leads leave the list but keep their history (delete is only for untouched leads). */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("leads_workspace_id_id_key").on(t.workspaceId, t.id),
    index("leads_workspace_created_at_idx").on(t.workspaceId, t.createdAt),
    index("leads_workspace_stage_idx").on(t.workspaceId, t.stage),
    index("leads_workspace_phone_idx").on(t.workspaceId, t.phoneE164),
    index("leads_workspace_email_idx").on(t.workspaceId, t.email),
    index("leads_created_by_user_id_idx").on(t.createdByUserId),
    check("leads_full_name_length", sql`char_length(${t.fullName}) between 1 and 80`),
    check("leads_contact", sql`${t.phoneE164} is not null or ${t.email} is not null`),
    check(
      "leads_phone_e164",
      sql`${t.phoneE164} is null or ${t.phoneE164} ~ '^\\+[1-9][0-9]{6,14}$'`,
    ),
    check("leads_email_length", sql`${t.email} is null or char_length(${t.email}) <= 254`),
    check(
      "leads_goal",
      sql`${t.goal} in ('lose_weight', 'build_muscle', 'get_stronger', 'improve_fitness', 'sports_performance', 'other')`,
    ),
    check(
      "leads_training_mode",
      sql`${t.trainingMode} is null or ${t.trainingMode} in ('in_person', 'online', 'hybrid')`,
    ),
    check(
      "leads_preferred_schedule_length",
      sql`${t.preferredSchedule} is null or char_length(${t.preferredSchedule}) <= 200`,
    ),
    check("leads_message_length", sql`${t.message} is null or char_length(${t.message}) <= 1000`),
    check(
      "leads_source",
      sql`${t.source} in ('public_page', 'qr', 'instagram', 'whatsapp', 'facebook', 'google', 'website', 'referral', 'walk_in', 'other')`,
    ),
    check("leads_campaign_length", sql`${t.campaign} is null or char_length(${t.campaign}) <= 100`),
    check("leads_utm_object", sql`jsonb_typeof(${t.utm}) = 'object'`),
    check("leads_referrer_length", sql`${t.referrer} is null or char_length(${t.referrer}) <= 120`),
    check(
      "leads_stage",
      sql`${t.stage} in ('new', 'contacted', 'trial_booked', 'interested', 'converted', 'lost')`,
    ),
    check("leads_created_via", sql`${t.createdVia} in ('public_page', 'manual')`),
    check("leads_location_length", sql`${t.location} is null or char_length(${t.location}) <= 120`),
    check(
      "leads_interested_service_length",
      sql`${t.interestedService} is null or char_length(${t.interestedService}) <= 120`,
    ),
    check(
      "leads_lost_reason",
      sql`${t.lostReason} is null or ${t.lostReason} in ('price', 'timing', 'location', 'chose_another_coach', 'no_response', 'not_a_fit', 'other')`,
    ),
    check(
      "leads_lost_fields_only_when_lost",
      sql`${t.stage} = 'lost' or (${t.lostReason} is null and ${t.nurtureUntil} is null)`,
    ),
    // Search (PROMPT §8.2, pg_trgm): name, email and phone with ILIKE '%…%'.
    index("leads_full_name_trgm_idx").using("gin", sql`${t.fullName} gin_trgm_ops`),
    index("leads_email_trgm_idx").using("gin", sql`(${t.email}::text) gin_trgm_ops`),
    index("leads_phone_trgm_idx").using("gin", sql`${t.phoneE164} gin_trgm_ops`),
  ],
);

/** The lead timeline (PROMPT §8.2). Insert-only; later steps add their activity types. */
export const leadActivities = pgTable(
  "lead_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    leadId: uuid("lead_id").notNull(),
    type: text("type").notNull(),
    data: jsonb("data").notNull().default({}),
    actorKind: text("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "lead_activities_lead_fk",
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
    index("lead_activities_workspace_lead_created_at_idx").on(t.workspaceId, t.leadId, t.createdAt),
    index("lead_activities_actor_user_id_idx").on(t.actorUserId),
    check(
      "lead_activities_type",
      sql`${t.type} in ('enquiry_received', 'created', 'details_updated', 'stage_changed', 'note', 'archived', 'restored')`,
    ),
    check(
      "lead_activities_note_body",
      sql`${t.type} <> 'note' or char_length(${t.data} ->> 'body') between 1 and 2000`,
    ),
    check("lead_activities_data_object", sql`jsonb_typeof(${t.data}) = 'object'`),
    check("lead_activities_actor_kind", sql`${t.actorKind} in ('trainer', 'system')`),
  ],
);

/** The consent a lead gave, pinned to the exact form version (PROMPT §8.2). Insert-only. */
export const leadConsents = pgTable(
  "lead_consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    leadId: uuid("lead_id").notNull(),
    leadFormId: uuid("lead_form_id").notNull(),
    /** Salted hash (IP_HASH_SALT), never the raw address. */
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "lead_consents_lead_fk",
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "lead_consents_lead_form_fk",
      columns: [t.workspaceId, t.leadFormId],
      foreignColumns: [leadForms.workspaceId, leadForms.id],
    }),
    index("lead_consents_workspace_lead_idx").on(t.workspaceId, t.leadId),
    index("lead_consents_workspace_lead_form_idx").on(t.workspaceId, t.leadFormId),
    check(
      "lead_consents_user_agent_length",
      sql`${t.userAgent} is null or char_length(${t.userAgent}) <= 300`,
    ),
  ],
);

/**
 * In-app notifications (PROMPT §8.10). Rows are written by system work (e.g. a public enquiry); the
 * bell, unread count and mark-read UI arrive in step 5.2.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    /** An in-app path such as `/app/leads/<id>`. */
    link: text("link"),
    data: jsonb("data").notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_recipient_created_at_idx").on(t.recipientUserId, t.createdAt),
    index("notifications_workspace_id_idx").on(t.workspaceId),
    check("notifications_type", sql`${t.type} in ('new_lead')`),
    check("notifications_title_length", sql`char_length(${t.title}) between 1 and 160`),
    check("notifications_body_length", sql`${t.body} is null or char_length(${t.body}) <= 500`),
    check(
      "notifications_link",
      sql`${t.link} is null or (${t.link} ~ '^/[^/]' and char_length(${t.link}) <= 300)`,
    ),
    check("notifications_data_object", sql`jsonb_typeof(${t.data}) = 'object'`),
  ],
);
