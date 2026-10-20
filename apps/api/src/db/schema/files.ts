import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/**
 * Every stored object, and the storage ledger (PROMPT §10.2, §17.7): `size_bytes` (main + thumbnail)
 * is what the budget sums. Rows are soft-deleted (`deleted_at`) and the objects purged 7 days later
 * by a job (`purged_at`) — R2 has no versioning to undo mistakes. Object keys are immutable UUIDs.
 */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL only for platform-owned media (e.g. global exercise images, later). */
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: text("kind").notNull(),
    bucket: text("bucket").notNull(),
    objectKey: text("object_key").notNull().unique("files_object_key_key"),
    thumbnailKey: text("thumbnail_key").unique("files_thumbnail_key_key"),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    /** SHA-256 of the stored (processed) main object. */
    checksum: text("checksum").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    purgedAt: timestamp("purged_at", { withTimezone: true }),
  },
  (t) => [
    index("files_workspace_id_idx").on(t.workspaceId),
    index("files_uploaded_by_user_id_idx").on(t.uploadedByUserId),
    index("files_deleted_at_idx")
      .on(t.deletedAt)
      .where(sql`${t.purgedAt} is null`),
    check("files_kind", sql`${t.kind} in ('trainer_avatar', 'public_page_photo', 'client_avatar')`),
    check("files_bucket", sql`${t.bucket} in ('private', 'public')`),
    check(
      "files_kind_bucket",
      sql`(${t.kind} = 'client_avatar' and ${t.bucket} = 'private') or (${t.kind} <> 'client_avatar' and ${t.bucket} = 'public')`,
    ),
    check("files_mime_type", sql`${t.mimeType} in ('image/webp')`),
    check("files_size_bytes", sql`${t.sizeBytes} > 0`),
    check("files_dimensions", sql`${t.width} > 0 and ${t.height} > 0`),
    check("files_purged_after_delete", sql`${t.purgedAt} is null or ${t.deletedAt} is not null`),
  ],
);
