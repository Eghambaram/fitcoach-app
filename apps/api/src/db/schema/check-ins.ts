import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { clients } from "./clients";
import { timestamps } from "./columns";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/**
 * Daily check-ins (PROMPT §8.7): self-reported, one per client per local date (workspace time
 * zone). The client may edit it until local midnight; every edit keeps the previous values in
 * `check_in_revisions`. The trainer marks it reviewed, optionally with a reply note.
 */
export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    localDate: date("local_date").notNull(),
    feeling: text("feeling").notNull(),
    energy: smallint("energy").notNull(),
    sleep: smallint("sleep").notNull(),
    soreness: text("soreness").notNull(),
    notes: text("notes"),
    workoutFeedback: text("workout_feedback"),
    /** Same-day edits so far (each one is in check_in_revisions). */
    revisions: integer("revisions").notNull().default(0),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** The trainer's note back to the client when reviewing. */
    reply: text("reply"),
    ...timestamps,
  },
  (t) => [
    unique("check_ins_workspace_id_id_key").on(t.workspaceId, t.id),
    foreignKey({
      name: "check_ins_client_fk",
      columns: [t.workspaceId, t.clientId],
      foreignColumns: [clients.workspaceId, clients.id],
    }).onDelete("cascade"),
    unique("check_ins_client_local_date_key").on(t.clientId, t.localDate),
    index("check_ins_workspace_reviewed_idx").on(t.workspaceId, t.reviewedAt, t.localDate),
    index("check_ins_workspace_client_date_idx").on(t.workspaceId, t.clientId, t.localDate),
    index("check_ins_reviewed_by_user_id_idx").on(t.reviewedByUserId),
    check("check_ins_feeling", sql`${t.feeling} in ('great', 'good', 'okay', 'tired', 'poor')`),
    check("check_ins_energy", sql`${t.energy} between 1 and 10`),
    check("check_ins_sleep", sql`${t.sleep} between 1 and 10`),
    check("check_ins_soreness", sql`${t.soreness} in ('none', 'mild', 'moderate', 'high')`),
    check("check_ins_notes_length", sql`char_length(${t.notes}) <= 1000`),
    check("check_ins_workout_feedback_length", sql`char_length(${t.workoutFeedback}) <= 1000`),
    check("check_ins_reply_length", sql`char_length(${t.reply}) <= 1000`),
    check("check_ins_reviewed", sql`(${t.reviewedAt} is null) = (${t.reviewedByUserId} is null)`),
  ],
);

/** The values a check-in had before each same-day edit (append-only, written by a trigger). */
export const checkInRevisions = pgTable(
  "check_in_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    checkInId: uuid("check_in_id").notNull(),
    previous: jsonb("previous").notNull(),
    revisedAt: timestamp("revised_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "check_in_revisions_check_in_fk",
      columns: [t.workspaceId, t.checkInId],
      foreignColumns: [checkIns.workspaceId, checkIns.id],
    }).onDelete("cascade"),
    index("check_in_revisions_workspace_check_in_idx").on(t.workspaceId, t.checkInId),
    check("check_in_revisions_previous", sql`jsonb_typeof(${t.previous}) = 'object'`),
  ],
);
