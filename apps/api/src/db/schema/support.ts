import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Supporting tables from PROMPT §10.2 created in step 1.2. Mirrors the SQL migrations, which are
 * authoritative (RLS, grants and functions live in the custom migrations).
 * FKs to users/workspaces are added in step 1.3 when those tables exist (expand → migrate → contract).
 */

/** Fixed-window counters behind app.check_rate_limit(). Keys are hashed by callers; only fitcoach_system writes. */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    index("rate_limit_buckets_expires_at_idx").on(t.expiresAt),
    check("rate_limit_buckets_key_length", sql`char_length(${t.key}) between 1 and 200`),
  ],
);

/**
 * Replay protection for critical mutations (PROMPT §4.3). One row per user intent; `response_status`
 * stays NULL while the first request is still running.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id"),
    userId: uuid("user_id").notNull(),
    key: uuid("key").notNull(),
    endpoint: text("endpoint").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    unique("idempotency_keys_scope_key")
      .on(t.workspaceId, t.userId, t.endpoint, t.key)
      .nullsNotDistinct(),
    index("idempotency_keys_expires_at_idx").on(t.expiresAt),
    index("idempotency_keys_user_id_idx").on(t.userId),
    check("idempotency_keys_endpoint_length", sql`char_length(${t.endpoint}) between 1 and 200`),
  ],
);

/** Immutable audit trail (PROMPT §12.1). fitcoach_app may only INSERT rows matching its own context. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorKind: text("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id"),
    workspaceId: uuid("workspace_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    reason: text("reason"),
    before: jsonb("before"),
    after: jsonb("after"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
  },
  (t) => [
    index("audit_logs_occurred_at_idx").on(t.occurredAt.desc()),
    index("audit_logs_workspace_id_occurred_at_idx").on(t.workspaceId, t.occurredAt.desc()),
    index("audit_logs_actor_user_id_occurred_at_idx").on(t.actorUserId, t.occurredAt.desc()),
    index("audit_logs_action_idx").on(t.action),
    check(
      "audit_logs_actor_kind",
      sql`${t.actorKind} in ('trainer', 'client', 'platform_owner', 'system', 'cli')`,
    ),
    check("audit_logs_action_length", sql`char_length(${t.action}) between 1 and 100`),
    check("audit_logs_reason_length", sql`${t.reason} is null or char_length(${t.reason}) <= 500`),
    check(
      "audit_logs_user_agent_length",
      sql`${t.userAgent} is null or char_length(${t.userAgent}) <= 300`,
    ),
  ],
);

/**
 * Outcome of each background job run (PROMPT §13), for the Platform Health page (step 6.1).
 * System-only; kept 30 days.
 */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
    summary: jsonb("summary").notNull().default({}),
    error: text("error"),
  },
  (t) => [
    index("job_runs_name_started_at_idx").on(t.name, t.startedAt),
    check("job_runs_status", sql`${t.status} in ('succeeded', 'failed')`),
    check("job_runs_name_length", sql`char_length(${t.name}) between 1 and 80`),
    check("job_runs_error_length", sql`${t.error} is null or char_length(${t.error}) <= 1000`),
    check("job_runs_summary_object", sql`jsonb_typeof(${t.summary}) = 'object'`),
  ],
);
