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
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { timestamps } from "./columns";
import { users } from "./identity";
import { leads } from "./leads";
import { workspaces } from "./workspaces";

/**
 * Recurring client sessions (PROMPT §8.6): expanded into concrete `appointments` (≤ 52) when created.
 * The series row keeps the pattern for "this and following" edits.
 */
export const appointmentSeries = pgTable(
  "appointment_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    kind: text("kind").notNull(),
    weekdays: smallint("weekdays").array().notNull(),
    startTime: time("start_time").notNull(),
    durationMin: integer("duration_min").notNull(),
    timezone: text("timezone").notNull(),
    location: text("location"),
    meetingUrl: text("meeting_url"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    occurrenceCount: integer("occurrence_count"),
    status: text("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    unique("appointment_series_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "appointment_series_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    index("appointment_series_workspace_client_idx").on(t.workspaceId, t.clientId),
    index("appointment_series_created_by_user_id_idx").on(t.createdByUserId),
    check("appointment_series_kind", sql`${t.kind} in ('session', 'online_session')`),
    check(
      "appointment_series_weekdays",
      sql`cardinality(${t.weekdays}) between 1 and 7 and ${t.weekdays} <@ array[1,2,3,4,5,6,7]::smallint[]`,
    ),
    check("appointment_series_duration", sql`${t.durationMin} between 15 and 480`),
    check(
      "appointment_series_end",
      sql`${t.endsOn} is not null or ${t.occurrenceCount} is not null`,
    ),
    check(
      "appointment_series_occurrences",
      sql`${t.occurrenceCount} is null or ${t.occurrenceCount} between 1 and 52`,
    ),
    check("appointment_series_dates", sql`${t.endsOn} is null or ${t.endsOn} >= ${t.startsOn}`),
    check("appointment_series_status", sql`${t.status} in ('active', 'ended')`),
    check(
      "appointment_series_location_length",
      sql`${t.location} is null or char_length(${t.location}) <= 120`,
    ),
    check(
      "appointment_series_meeting_url",
      sql`${t.meetingUrl} is null or (${t.meetingUrl} ~ '^https?://' and char_length(${t.meetingUrl}) <= 300)`,
    ),
  ],
);

/**
 * Appointments (PROMPT §8.6, §10.3): exactly one client or lead; `ends_at` maintained by a trigger;
 * overlapping scheduled/confirmed appointments are refused by an exclusion constraint (migration
 * 0018). Session notes are trainer-only.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    leadId: uuid("lead_id"),
    seriesId: uuid("series_id"),
    kind: text("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMin: integer("duration_min").notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    timezone: text("timezone").notNull(),
    status: text("status").notNull().default("scheduled"),
    location: text("location"),
    meetingUrl: text("meeting_url"),
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    lateCancel: boolean("late_cancel").notNull().default(false),
    attendanceMarkedAt: timestamp("attendance_marked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    unique("appointments_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "appointments_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "appointments_lead_fk",
      columns: [t.workspaceId, t.leadId],
      foreignColumns: [leads.workspaceId, leads.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "appointments_series_fk",
      columns: [t.workspaceId, t.seriesId],
      foreignColumns: [appointmentSeries.workspaceId, appointmentSeries.id],
    }).onDelete("cascade"),
    index("appointments_workspace_starts_at_idx").on(t.workspaceId, t.startsAt),
    index("appointments_workspace_client_idx").on(t.workspaceId, t.clientId, t.startsAt),
    index("appointments_workspace_lead_idx").on(t.workspaceId, t.leadId),
    index("appointments_workspace_series_idx").on(t.workspaceId, t.seriesId, t.startsAt),
    index("appointments_created_by_user_id_idx").on(t.createdByUserId),
    check("appointments_one_person", sql`num_nonnulls(${t.clientId}, ${t.leadId}) = 1`),
    check(
      "appointments_kind",
      sql`${t.kind} in ('session', 'online_session', 'trial', 'consultation')`,
    ),
    check(
      "appointments_status",
      sql`${t.status} in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')`,
    ),
    check("appointments_duration", sql`${t.durationMin} between 15 and 480`),
    check(
      "appointments_cancelled",
      sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null and ${t.cancelReason} is not null)`,
    ),
    check("appointments_late_cancel", sql`not ${t.lateCancel} or ${t.status} = 'cancelled'`),
    check(
      "appointments_attendance",
      sql`${t.status} not in ('completed', 'no_show') or ${t.attendanceMarkedAt} is not null`,
    ),
    check(
      "appointments_cancel_reason_length",
      sql`${t.cancelReason} is null or char_length(${t.cancelReason}) between 1 and 200`,
    ),
    check(
      "appointments_location_length",
      sql`${t.location} is null or char_length(${t.location}) <= 120`,
    ),
    check(
      "appointments_meeting_url",
      sql`${t.meetingUrl} is null or (${t.meetingUrl} ~ '^https?://' and char_length(${t.meetingUrl}) <= 300)`,
    ),
    check("appointments_notes_length", sql`${t.notes} is null or char_length(${t.notes}) <= 2000`),
    check("appointments_timezone_length", sql`char_length(${t.timezone}) between 1 and 64`),
  ],
);

/** Appointment history (PROMPT §8.6): creation, reschedules, cancellations, attendance. Insert-only. */
export const appointmentChanges = pgTable(
  "appointment_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    appointmentId: uuid("appointment_id").notNull(),
    kind: text("kind").notNull(),
    data: jsonb("data").notNull().default({}),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "appointment_changes_appointment_fk",
      columns: [t.workspaceId, t.appointmentId],
      foreignColumns: [appointments.workspaceId, appointments.id],
    }).onDelete("cascade"),
    index("appointment_changes_workspace_appointment_idx").on(
      t.workspaceId,
      t.appointmentId,
      t.createdAt,
    ),
    index("appointment_changes_actor_user_id_idx").on(t.actorUserId),
    check(
      "appointment_changes_kind",
      sql`${t.kind} in ('created', 'rescheduled', 'cancelled', 'attendance', 'notes')`,
    ),
    check("appointment_changes_data_object", sql`jsonb_typeof(${t.data}) = 'object'`),
  ],
);
