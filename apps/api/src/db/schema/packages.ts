import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { timestamps } from "./columns";
import { users } from "./identity";
import { appointments } from "./scheduling";
import { packagePresets } from "./workspaces";

/**
 * Packages a client bought (PROMPT §8.3A, step 3.2). One active package per client (partial unique
 * index); selling a new one closes the previous one. Money is integer paise; amounts are bounded by
 * CHECK constraints, so JS numbers stay exact.
 */
export const clientPackages = pgTable(
  "client_packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    clientId: uuid("client_id").notNull(),
    presetId: uuid("preset_id").references(() => packagePresets.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    sessionsIncluded: integer("sessions_included"),
    /** Informational only (ADR-0031). */
    sessionsPerWeek: integer("sessions_per_week"),
    startsOn: date("starts_on").notNull(),
    expiresOn: date("expires_on"),
    pricePaise: bigint("price_paise", { mode: "number" }).notNull(),
    amountDuePaise: bigint("amount_due_paise", { mode: "number" }).notNull(),
    paymentDueOn: date("payment_due_on"),
    status: text("status").notNull().default("active"),
    notes: text("notes"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedReason: text("closed_reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    unique("client_packages_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "client_packages_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    uniqueIndex("client_packages_one_active_key")
      .on(t.workspaceId, t.clientId)
      .where(sql`${t.status} = 'active'`),
    index("client_packages_workspace_client_created_at_idx").on(
      t.workspaceId,
      t.clientId,
      t.createdAt,
    ),
    index("client_packages_preset_id_idx").on(t.presetId),
    index("client_packages_created_by_user_id_idx").on(t.createdByUserId),
    check(
      "client_packages_kind",
      sql`${t.kind} in ('session_pack', 'time_based', 'online_coaching')`,
    ),
    check(
      "client_packages_status",
      sql`${t.status} in ('active', 'completed', 'expired', 'cancelled')`,
    ),
    check("client_packages_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check(
      "client_packages_sessions_included",
      sql`${t.sessionsIncluded} is null or ${t.sessionsIncluded} between 1 and 500`,
    ),
    check(
      "client_packages_session_pack_needs_sessions",
      sql`${t.kind} <> 'session_pack' or ${t.sessionsIncluded} is not null`,
    ),
    check(
      "client_packages_sessions_per_week",
      sql`${t.sessionsPerWeek} is null or ${t.sessionsPerWeek} between 1 and 14`,
    ),
    check("client_packages_dates", sql`${t.expiresOn} is null or ${t.expiresOn} >= ${t.startsOn}`),
    check(
      "client_packages_money",
      sql`${t.pricePaise} between 0 and 100000000 and ${t.amountDuePaise} between 0 and ${t.pricePaise}`,
    ),
    check("client_packages_closed", sql`(${t.status} = 'active') = (${t.closedAt} is null)`),
    check("client_packages_notes_length", sql`char_length(${t.notes}) <= 500`),
    check("client_packages_closed_reason_length", sql`char_length(${t.closedReason}) <= 200`),
  ],
);

/**
 * Session use (§8.3A, CLAUDE.md rule 20b). Append-only: a mark writes +1 (or 0 when the policy says
 * it doesn't use a session, or the package is time-based); un-marking writes a reversal row that
 * points at it. `mark_no` counts marks per (package, appointment), so a double submit can't deduct
 * twice while marking again after an undo still works. Sessions used = sum(sessions_used).
 */
export const packageSessionLedger = pgTable(
  "package_session_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    packageId: uuid("package_id").notNull(),
    appointmentId: uuid("appointment_id"),
    reason: text("reason").notNull(),
    sessionsUsed: integer("sessions_used").notNull(),
    markNo: integer("mark_no"),
    reversesId: uuid("reverses_id"),
    note: text("note"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("package_session_ledger_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "package_session_ledger_package_fk",
      columns: [t.workspaceId, t.packageId],
      foreignColumns: [clientPackages.workspaceId, clientPackages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "package_session_ledger_appointment_fk",
      columns: [t.workspaceId, t.appointmentId],
      foreignColumns: [appointments.workspaceId, appointments.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "package_session_ledger_reverses_fk",
      columns: [t.workspaceId, t.reversesId],
      foreignColumns: [t.workspaceId, t.id],
    }).onDelete("cascade"),
    unique("package_session_ledger_mark_key").on(t.packageId, t.appointmentId, t.markNo),
    unique("package_session_ledger_reverses_key").on(t.reversesId),
    index("package_session_ledger_workspace_package_created_at_idx").on(
      t.workspaceId,
      t.packageId,
      t.createdAt,
    ),
    index("package_session_ledger_workspace_appointment_idx").on(t.workspaceId, t.appointmentId),
    index("package_session_ledger_actor_user_id_idx").on(t.actorUserId),
    check(
      "package_session_ledger_reason",
      sql`${t.reason} in ('attended', 'no_show', 'late_cancel', 'manual_adjustment')`,
    ),
    check(
      "package_session_ledger_shape",
      sql`(
        ${t.reason} = 'manual_adjustment' and ${t.appointmentId} is null and ${t.reversesId} is null
        and ${t.markNo} is null and ${t.note} is not null and ${t.sessionsUsed} between -50 and 50
        and ${t.sessionsUsed} <> 0
      ) or (
        ${t.reason} <> 'manual_adjustment' and ${t.appointmentId} is not null and (
          (${t.reversesId} is null and ${t.markNo} >= 1 and ${t.sessionsUsed} in (0, 1))
          or (${t.reversesId} is not null and ${t.markNo} is null and ${t.sessionsUsed} in (0, -1))
        )
      )`,
    ),
    check("package_session_ledger_note_length", sql`char_length(${t.note}) between 1 and 300`),
  ],
);

/**
 * Payments the trainer recorded (§8.3A) — FitCoach processes none. Append-only: a correction is a
 * voiding row (same amount, a reason) pointing at the original.
 */
export const clientPayments = pgTable(
  "client_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    packageId: uuid("package_id").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    method: text("method").notNull(),
    paidOn: date("paid_on").notNull(),
    reference: text("reference"),
    note: text("note"),
    voidsId: uuid("voids_id"),
    voidReason: text("void_reason"),
    recordedByUserId: uuid("recorded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("client_payments_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "client_payments_package_fk",
      columns: [t.workspaceId, t.packageId],
      foreignColumns: [clientPackages.workspaceId, clientPackages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "client_payments_voids_fk",
      columns: [t.workspaceId, t.voidsId],
      foreignColumns: [t.workspaceId, t.id],
    }).onDelete("cascade"),
    unique("client_payments_voids_key").on(t.voidsId),
    index("client_payments_workspace_package_created_at_idx").on(
      t.workspaceId,
      t.packageId,
      t.createdAt,
    ),
    index("client_payments_recorded_by_user_id_idx").on(t.recordedByUserId),
    check("client_payments_amount", sql`${t.amountPaise} between 1 and 100000000`),
    check(
      "client_payments_method",
      sql`${t.method} in ('cash', 'upi', 'bank_transfer', 'card', 'other')`,
    ),
    check("client_payments_void", sql`(${t.voidsId} is null) = (${t.voidReason} is null)`),
    check("client_payments_reference_length", sql`char_length(${t.reference}) <= 80`),
    check("client_payments_note_length", sql`char_length(${t.note}) <= 300`),
    check(
      "client_payments_void_reason_length",
      sql`char_length(${t.voidReason}) between 1 and 200`,
    ),
  ],
);
