CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"workspace_id" uuid,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" text,
	"user_agent" text,
	"request_id" text,
	CONSTRAINT "audit_logs_actor_kind" CHECK ("audit_logs"."actor_kind" in ('trainer', 'client', 'platform_owner', 'system', 'cli')),
	CONSTRAINT "audit_logs_action_length" CHECK (char_length("audit_logs"."action") between 1 and 100),
	CONSTRAINT "audit_logs_reason_length" CHECK ("audit_logs"."reason" is null or char_length("audit_logs"."reason") <= 500),
	CONSTRAINT "audit_logs_user_agent_length" CHECK ("audit_logs"."user_agent" is null or char_length("audit_logs"."user_agent") <= 300)
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"user_id" uuid NOT NULL,
	"key" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key" UNIQUE NULLS NOT DISTINCT("workspace_id","user_id","endpoint","key"),
	CONSTRAINT "idempotency_keys_endpoint_length" CHECK (char_length("idempotency_keys"."endpoint") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_buckets" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_key_window_start_pk" PRIMARY KEY("key","window_start"),
	CONSTRAINT "rate_limit_buckets_key_length" CHECK (char_length("rate_limit_buckets"."key") between 1 and 200)
);
--> statement-breakpoint
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_id_occurred_at_idx" ON "audit_logs" USING btree ("workspace_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_id_occurred_at_idx" ON "audit_logs" USING btree ("actor_user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_user_id_idx" ON "idempotency_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_at_idx" ON "rate_limit_buckets" USING btree ("expires_at");