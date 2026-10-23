CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" text NOT NULL,
	"lead_id" uuid,
	"client_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_type" CHECK ("activity_events"."type" in ('lead_converted')),
	CONSTRAINT "activity_events_subject" CHECK (num_nonnulls("activity_events"."lead_id", "activity_events"."client_id") >= 1),
	CONSTRAINT "activity_events_data_object" CHECK (jsonb_typeof("activity_events"."data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"source_lead_id" uuid,
	"status" text DEFAULT 'onboarding_draft' NOT NULL,
	"full_name" text NOT NULL,
	"phone_e164" text,
	"email" "citext",
	"goal" text,
	"training_mode" text,
	"preferred_schedule" text,
	"location" text,
	"source" text,
	"campaign" text,
	"referrer" text,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dob" date,
	"timezone" text,
	"coaching_start_on" date,
	"features" jsonb DEFAULT '{"workoutSelfLogging":false,"checkIns":true,"progressSelfLogging":false}'::jsonb NOT NULL,
	"emergency_contact" jsonb,
	"archived_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "clients_workspace_source_lead_key" UNIQUE("workspace_id","source_lead_id"),
	CONSTRAINT "clients_status" CHECK ("clients"."status" in ('onboarding_draft', 'active', 'paused', 'archived')),
	CONSTRAINT "clients_archived_at" CHECK (("clients"."status" = 'archived') = ("clients"."archived_at" is not null)),
	CONSTRAINT "clients_full_name_length" CHECK (char_length("clients"."full_name") between 1 and 80),
	CONSTRAINT "clients_phone_e164" CHECK ("clients"."phone_e164" is null or "clients"."phone_e164" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "clients_email_length" CHECK ("clients"."email" is null or char_length("clients"."email") <= 254),
	CONSTRAINT "clients_goal" CHECK ("clients"."goal" is null or "clients"."goal" in ('lose_weight', 'build_muscle', 'get_stronger', 'improve_fitness', 'sports_performance', 'other')),
	CONSTRAINT "clients_training_mode" CHECK ("clients"."training_mode" is null or "clients"."training_mode" in ('in_person', 'online', 'hybrid')),
	CONSTRAINT "clients_preferred_schedule_length" CHECK ("clients"."preferred_schedule" is null or char_length("clients"."preferred_schedule") <= 200),
	CONSTRAINT "clients_location_length" CHECK ("clients"."location" is null or char_length("clients"."location") <= 120),
	CONSTRAINT "clients_source" CHECK ("clients"."source" is null or "clients"."source" in ('public_page', 'qr', 'instagram', 'whatsapp', 'facebook', 'google', 'website', 'referral', 'walk_in', 'other')),
	CONSTRAINT "clients_campaign_length" CHECK ("clients"."campaign" is null or char_length("clients"."campaign") <= 100),
	CONSTRAINT "clients_referrer_length" CHECK ("clients"."referrer" is null or char_length("clients"."referrer") <= 120),
	CONSTRAINT "clients_utm_object" CHECK (jsonb_typeof("clients"."utm") = 'object'),
	CONSTRAINT "clients_features_object" CHECK (jsonb_typeof("clients"."features") = 'object'),
	CONSTRAINT "clients_emergency_contact_object" CHECK ("clients"."emergency_contact" is null or jsonb_typeof("clients"."emergency_contact") = 'object'),
	CONSTRAINT "clients_timezone_length" CHECK ("clients"."timezone" is null or char_length("clients"."timezone") between 1 and 64)
);
--> statement-breakpoint
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_type";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "converted_client_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "converted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "converted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_source_lead_fk" FOREIGN KEY ("workspace_id","source_lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_workspace_created_at_idx" ON "activity_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_events_workspace_lead_idx" ON "activity_events" USING btree ("workspace_id","lead_id");--> statement-breakpoint
CREATE INDEX "activity_events_workspace_client_idx" ON "activity_events" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "activity_events_actor_user_id_idx" ON "activity_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_workspace_phone_key" ON "clients" USING btree ("workspace_id","phone_e164") WHERE "clients"."status" <> 'archived' and "clients"."phone_e164" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_workspace_email_key" ON "clients" USING btree ("workspace_id","email") WHERE "clients"."status" <> 'archived' and "clients"."email" is not null;--> statement-breakpoint
CREATE INDEX "clients_workspace_status_idx" ON "clients" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "clients_user_id_idx" ON "clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clients_created_by_user_id_idx" ON "clients" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_by_user_id_users_id_fk" FOREIGN KEY ("converted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_workspace_converted_client_idx" ON "leads" USING btree ("workspace_id","converted_client_id");--> statement-breakpoint
CREATE INDEX "leads_converted_by_user_id_idx" ON "leads" USING btree ("converted_by_user_id");--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_type" CHECK ("lead_activities"."type" in ('enquiry_received', 'created', 'details_updated', 'stage_changed', 'note', 'archived', 'restored', 'follow_up_scheduled', 'follow_up_rescheduled', 'follow_up_completed', 'follow_up_skipped', 'converted'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted" CHECK (("leads"."stage" = 'converted') = ("leads"."converted_client_id" is not null and "leads"."converted_at" is not null));