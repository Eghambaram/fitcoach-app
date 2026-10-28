import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/**
 * "Send feedback" (PROMPT §16.0, step 5.3): a trainer's message with the page it was sent from.
 * Written by the trainer; read and triaged by the platform owner (step 6.1, fitcoach_system).
 */
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    page: text("page"),
    message: text("message").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("feedback_status_created_at_idx").on(t.status, t.createdAt),
    index("feedback_workspace_id_idx").on(t.workspaceId),
    index("feedback_user_id_idx").on(t.userId),
    check("feedback_status", sql`${t.status} in ('open', 'triaged', 'closed')`),
    check("feedback_message_length", sql`char_length(${t.message}) between 3 and 2000`),
    check(
      "feedback_page",
      sql`${t.page} is null or (${t.page} ~ '^/' and char_length(${t.page}) <= 200)`,
    ),
  ],
);

/**
 * Workspace data exports (PROMPT §8.12): a zip of CSVs built by a background job in the private
 * bucket under `exports/`, downloadable for 24 hours through a fresh short-lived link.
 */
export const dataExports = pgTable(
  "data_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    objectKey: text("object_key"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("data_exports_workspace_created_at_idx").on(t.workspaceId, t.createdAt),
    index("data_exports_requested_by_user_id_idx").on(t.requestedByUserId),
    check("data_exports_status", sql`${t.status} in ('pending', 'ready', 'failed', 'expired')`),
    check(
      "data_exports_ready",
      sql`${t.status} <> 'ready' or (${t.objectKey} is not null and ${t.expiresAt} is not null)`,
    ),
    check("data_exports_error_length", sql`${t.error} is null or char_length(${t.error}) <= 500`),
  ],
);
