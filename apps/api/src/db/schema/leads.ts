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

/** Lead CRM (PROMPT §8.2). Conversion columns arrive with step 2.4. */
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
    /** Maintained by triggers on `communication_logs` (latest contact). */
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    /** Maintained by triggers on `lead_follow_ups` (earliest open follow-up). */
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    /**
     * Set only by the conversion transaction (step 2.4). The FK to `clients` lives in migration 0014
     * (clients.ts imports this file, so it can't be declared here without a cycle).
     */
    convertedClientId: uuid("converted_client_id"),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    convertedByUserId: uuid("converted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
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
    index("leads_workspace_next_follow_up_at_idx").on(t.workspaceId, t.nextFollowUpAt),
    index("leads_workspace_converted_client_idx").on(t.workspaceId, t.convertedClientId),
    index("leads_converted_by_user_id_idx").on(t.convertedByUserId),
    check(
      "leads_converted",
      sql`(${t.stage} = 'converted') = (${t.convertedClientId} is not null and ${t.convertedAt} is not null)`,
    ),
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
      sql`${t.type} in ('enquiry_received', 'created', 'details_updated', 'stage_changed', 'note', 'archived', 'restored', 'follow_up_scheduled', 'follow_up_rescheduled', 'follow_up_completed', 'follow_up_skipped', 'converted', 'trial_booked', 'trial_completed', 'trial_no_show', 'trial_cancelled')`,
    ),
    check(
      "lead_activities_note_body",
      sql`${t.type} <> 'note' or char_length(${t.data} ->> 'body') between 1 and 2000`,
    ),
    check("lead_activities_data_object", sql`jsonb_typeof(${t.data}) = 'object'`),
    check("lead_activities_actor_kind", sql`${t.actorKind} in ('trainer', 'system')`),
  ],
);

/**
 * Lead follow-ups (PROMPT §8.2). Open ones can be rescheduled; finishing one (done or skipped) is
 * final. Never deleted. Triggers keep `leads.next_follow_up_at` in step.
 */
export const leadFollowUps = pgTable(
  "lead_follow_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    leadId: uuid("lead_id").notNull(),
    actionType: text("action_type").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("open"),
    notes: text("notes"),
    reminder: text("reminder").notNull().default("none"),
    outcome: text("outcome"),
    outcomeNote: text("outcome_note"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedByUserId: uuid("completed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "lead_follow_ups_lead_fk",
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
    unique("lead_follow_ups_workspace_lead_id_key").on(t.workspaceId, t.leadId, t.id),
    index("lead_follow_ups_workspace_lead_status_idx").on(t.workspaceId, t.leadId, t.status),
    index("lead_follow_ups_workspace_open_due_idx")
      .on(t.workspaceId, t.dueAt)
      .where(sql`${t.status} = 'open'`),
    index("lead_follow_ups_created_by_user_id_idx").on(t.createdByUserId),
    index("lead_follow_ups_completed_by_user_id_idx").on(t.completedByUserId),
    check(
      "lead_follow_ups_action_type",
      sql`${t.actionType} in ('whatsapp', 'call', 'email', 'trial_confirmation', 'package_discussion', 'other')`,
    ),
    check("lead_follow_ups_status", sql`${t.status} in ('open', 'done', 'skipped')`),
    check("lead_follow_ups_reminder", sql`${t.reminder} in ('none', 'in_app')`),
    check(
      "lead_follow_ups_outcome",
      sql`${t.outcome} is null or ${t.outcome} in ('message_sent', 'spoke', 'no_answer', 'left_message', 'replied', 'other')`,
    ),
    check(
      "lead_follow_ups_notes_length",
      sql`${t.notes} is null or char_length(${t.notes}) <= 500`,
    ),
    check(
      "lead_follow_ups_outcome_note_length",
      sql`${t.outcomeNote} is null or char_length(${t.outcomeNote}) <= 500`,
    ),
    // PROMPT §10.3, made two-way: finished ⇔ completed_at, done ⇒ outcome, open ⇒ no outcome.
    check("lead_follow_ups_completed", sql`(${t.status} = 'open') = (${t.completedAt} is null)`),
    check("lead_follow_ups_done_outcome", sql`${t.status} <> 'done' or ${t.outcome} is not null`),
    check(
      "lead_follow_ups_open_no_outcome",
      sql`${t.status} <> 'open' or (${t.outcome} is null and ${t.outcomeNote} is null)`,
    ),
  ],
);

/**
 * Contacts the trainer logged (PROMPT §8.10): calls, messages, emails. Append-only. A WhatsApp row
 * exists only when the trainer confirmed "Sent" (CLAUDE.md rule 20d) — it never claims delivery.
 * Triggers keep `leads.last_contact_at` in step. Client contacts join with the clients table.
 */
export const communicationLogs = pgTable(
  "communication_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    leadId: uuid("lead_id").notNull(),
    followUpId: uuid("follow_up_id"),
    channel: text("channel").notNull(),
    outcome: text("outcome").notNull(),
    note: text("note"),
    /** The message template used, when the message was prefilled by the app. */
    templatePurpose: text("template_purpose"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "communication_logs_lead_fk",
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
    // The follow-up must belong to the same lead (and tenant).
    foreignKey({
      name: "communication_logs_follow_up_fk",
      columns: [t.workspaceId, t.leadId, t.followUpId],
      foreignColumns: [leadFollowUps.workspaceId, leadFollowUps.leadId, leadFollowUps.id],
    }).onDelete("cascade"),
    index("communication_logs_workspace_lead_occurred_at_idx").on(
      t.workspaceId,
      t.leadId,
      t.occurredAt,
    ),
    index("communication_logs_workspace_follow_up_idx").on(t.workspaceId, t.followUpId),
    index("communication_logs_actor_user_id_idx").on(t.actorUserId),
    check(
      "communication_logs_channel",
      sql`${t.channel} in ('whatsapp', 'call', 'email', 'in_person', 'other')`,
    ),
    check(
      "communication_logs_outcome",
      sql`${t.outcome} in ('message_sent', 'spoke', 'no_answer', 'left_message', 'replied', 'other')`,
    ),
    check(
      "communication_logs_note_length",
      sql`${t.note} is null or char_length(${t.note}) <= 1000`,
    ),
    check(
      "communication_logs_template_purpose",
      sql`${t.templatePurpose} is null or ${t.templatePurpose} in ('follow_up', 'trial_confirmation', 'client_invite', 'payment_reminder', 'package_renewal', 'check_in_nudge', 'session_reminder')`,
    ),
    check(
      "communication_logs_occurred_at",
      sql`${t.occurredAt} <= ${t.createdAt} + interval '5 minutes'`,
    ),
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
 * In-app notifications (PROMPT §8.10) for trainers and clients. Jobs and actions insert them with a
 * `dedupe_key`, unique per recipient, so a retried job or a restart never notifies twice (step 5.2).
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
    /** e.g. `follow_up:<id>`; one notification per recipient and key. */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("notifications_recipient_dedupe_key").on(t.recipientUserId, t.dedupeKey),
    index("notifications_recipient_created_at_idx").on(t.recipientUserId, t.createdAt),
    index("notifications_workspace_id_idx").on(t.workspaceId),
    check(
      "notifications_type",
      sql`${t.type} in ('new_lead', 'follow_up_due', 'trial_soon', 'attendance_needed', 'package_expiring', 'package_low', 'payment_due', 'check_in_submitted', 'invite_accepted', 'program_assigned', 'session_booked', 'session_changed', 'session_cancelled', 'account_approved', 'workspace_suspended', 'workspace_reactivated')`,
    ),
    check(
      "notifications_dedupe_key_length",
      sql`${t.dedupeKey} is null or char_length(${t.dedupeKey}) between 1 and 120`,
    ),
    check("notifications_title_length", sql`char_length(${t.title}) between 1 and 160`),
    check("notifications_body_length", sql`${t.body} is null or char_length(${t.body}) <= 500`),
    check(
      "notifications_link",
      sql`${t.link} is null or (${t.link} ~ '^/[^/]' and char_length(${t.link}) <= 300)`,
    ),
    check("notifications_data_object", sql`jsonb_typeof(${t.data}) = 'object'`),
  ],
);
