CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"object_key" text,
	"size_bytes" bigint,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "data_exports_status" CHECK ("data_exports"."status" in ('pending', 'ready', 'failed', 'expired')),
	CONSTRAINT "data_exports_ready" CHECK ("data_exports"."status" <> 'ready' or ("data_exports"."object_key" is not null and "data_exports"."expires_at" is not null)),
	CONSTRAINT "data_exports_error_length" CHECK ("data_exports"."error" is null or char_length("data_exports"."error") <= 500)
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"page" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_status" CHECK ("feedback"."status" in ('open', 'triaged', 'closed')),
	CONSTRAINT "feedback_message_length" CHECK (char_length("feedback"."message") between 3 and 2000),
	CONSTRAINT "feedback_page" CHECK ("feedback"."page" is null or ("feedback"."page" ~ '^/' and char_length("feedback"."page") <= 200))
);
--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_exports_workspace_created_at_idx" ON "data_exports" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "data_exports_requested_by_user_id_idx" ON "data_exports" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "feedback_status_created_at_idx" ON "feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "feedback_workspace_id_idx" ON "feedback" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "feedback_user_id_idx" ON "feedback" USING btree ("user_id");