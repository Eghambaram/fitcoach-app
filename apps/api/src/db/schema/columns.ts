import { customType, timestamp } from "drizzle-orm/pg-core";

/** Case-insensitive text (emails, slugs) — PROMPT §10.1. */
export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

/** `created_at` / `updated_at` pair; `updated_at` is maintained by the app.set_updated_at() trigger. */
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};
