CREATE TABLE "lead_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_activities_type" CHECK ("lead_activities"."type" in ('enquiry_received', 'stage_changed')),
	CONSTRAINT "lead_activities_data_object" CHECK (jsonb_typeof("lead_activities"."data") = 'object'),
	CONSTRAINT "lead_activities_actor_kind" CHECK ("lead_activities"."actor_kind" in ('trainer', 'system'))
);
--> statement-breakpoint
CREATE TABLE "lead_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"lead_form_id" uuid NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_consents_user_agent_length" CHECK ("lead_consents"."user_agent" is null or char_length("lead_consents"."user_agent") <= 300)
);
--> statement-breakpoint
CREATE TABLE "lead_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"consent_text" text NOT NULL,
	"fields" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_forms_workspace_version_key" UNIQUE("workspace_id","version"),
	CONSTRAINT "lead_forms_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "lead_forms_version" CHECK ("lead_forms"."version" > 0),
	CONSTRAINT "lead_forms_consent_text_length" CHECK (char_length("lead_forms"."consent_text") between 20 and 1000),
	CONSTRAINT "lead_forms_fields_object" CHECK (jsonb_typeof("lead_forms"."fields") = 'object')
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"phone_e164" text,
	"email" "citext",
	"goal" text NOT NULL,
	"training_mode" text,
	"preferred_schedule" text,
	"message" text,
	"source" text NOT NULL,
	"campaign" text,
	"utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"referrer" text,
	"stage" text DEFAULT 'new' NOT NULL,
	"created_via" text NOT NULL,
	"created_by_user_id" uuid,
	"last_contact_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "leads_full_name_length" CHECK (char_length("leads"."full_name") between 1 and 80),
	CONSTRAINT "leads_contact" CHECK ("leads"."phone_e164" is not null or "leads"."email" is not null),
	CONSTRAINT "leads_phone_e164" CHECK ("leads"."phone_e164" is null or "leads"."phone_e164" ~ '^\+[1-9][0-9]{6,14}$'),
	CONSTRAINT "leads_email_length" CHECK ("leads"."email" is null or char_length("leads"."email") <= 254),
	CONSTRAINT "leads_goal" CHECK ("leads"."goal" in ('lose_weight', 'build_muscle', 'get_stronger', 'improve_fitness', 'sports_performance', 'other')),
	CONSTRAINT "leads_training_mode" CHECK ("leads"."training_mode" is null or "leads"."training_mode" in ('in_person', 'online', 'hybrid')),
	CONSTRAINT "leads_preferred_schedule_length" CHECK ("leads"."preferred_schedule" is null or char_length("leads"."preferred_schedule") <= 200),
	CONSTRAINT "leads_message_length" CHECK ("leads"."message" is null or char_length("leads"."message") <= 1000),
	CONSTRAINT "leads_source" CHECK ("leads"."source" in ('public_page', 'qr', 'instagram', 'whatsapp', 'facebook', 'google', 'website', 'referral', 'walk_in', 'other')),
	CONSTRAINT "leads_campaign_length" CHECK ("leads"."campaign" is null or char_length("leads"."campaign") <= 100),
	CONSTRAINT "leads_utm_object" CHECK (jsonb_typeof("leads"."utm") = 'object'),
	CONSTRAINT "leads_referrer_length" CHECK ("leads"."referrer" is null or char_length("leads"."referrer") <= 120),
	CONSTRAINT "leads_stage" CHECK ("leads"."stage" in ('new', 'contacted', 'trial_booked', 'interested', 'converted', 'lost')),
	CONSTRAINT "leads_created_via" CHECK ("leads"."created_via" in ('public_page', 'manual'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_type" CHECK ("notifications"."type" in ('new_lead')),
	CONSTRAINT "notifications_title_length" CHECK (char_length("notifications"."title") between 1 and 160),
	CONSTRAINT "notifications_body_length" CHECK ("notifications"."body" is null or char_length("notifications"."body") <= 500),
	CONSTRAINT "notifications_link" CHECK ("notifications"."link" is null or ("notifications"."link" ~ '^/[^/]' and char_length("notifications"."link") <= 300)),
	CONSTRAINT "notifications_data_object" CHECK (jsonb_typeof("notifications"."data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "trainer_public_pages" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"headline" text,
	"bio" text,
	"location" text,
	"coaching_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainer_public_pages_headline_length" CHECK ("trainer_public_pages"."headline" is null or char_length("trainer_public_pages"."headline") <= 120),
	CONSTRAINT "trainer_public_pages_bio_length" CHECK ("trainer_public_pages"."bio" is null or char_length("trainer_public_pages"."bio") <= 1000),
	CONSTRAINT "trainer_public_pages_location_length" CHECK ("trainer_public_pages"."location" is null or char_length("trainer_public_pages"."location") <= 120),
	CONSTRAINT "trainer_public_pages_coaching_types" CHECK (cardinality("trainer_public_pages"."coaching_types") <= 8),
	CONSTRAINT "trainer_public_pages_published_at" CHECK (not "trainer_public_pages"."is_published" or "trainer_public_pages"."published_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "trainer_settings" ADD COLUMN "check_in_frequency" text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "trainer_settings" ADD COLUMN "no_check_in_days" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "trainer_settings" ADD COLUMN "no_measurement_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_consents" ADD CONSTRAINT "lead_consents_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_consents" ADD CONSTRAINT "lead_consents_lead_form_fk" FOREIGN KEY ("workspace_id","lead_form_id") REFERENCES "public"."lead_forms"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_public_pages" ADD CONSTRAINT "trainer_public_pages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_activities_workspace_lead_created_at_idx" ON "lead_activities" USING btree ("workspace_id","lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_activities_actor_user_id_idx" ON "lead_activities" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "lead_consents_workspace_lead_idx" ON "lead_consents" USING btree ("workspace_id","lead_id");--> statement-breakpoint
CREATE INDEX "lead_consents_workspace_lead_form_idx" ON "lead_consents" USING btree ("workspace_id","lead_form_id");--> statement-breakpoint
CREATE INDEX "lead_forms_created_by_user_id_idx" ON "lead_forms" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "leads_workspace_created_at_idx" ON "leads" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "leads_workspace_stage_idx" ON "leads" USING btree ("workspace_id","stage");--> statement-breakpoint
CREATE INDEX "leads_workspace_phone_idx" ON "leads" USING btree ("workspace_id","phone_e164");--> statement-breakpoint
CREATE INDEX "leads_workspace_email_idx" ON "leads" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "leads_created_by_user_id_idx" ON "leads" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_at_idx" ON "notifications" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_workspace_id_idx" ON "notifications" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "trainer_settings" ADD CONSTRAINT "trainer_settings_check_in_frequency" CHECK ("trainer_settings"."check_in_frequency" in ('daily', 'weekly'));--> statement-breakpoint
ALTER TABLE "trainer_settings" ADD CONSTRAINT "trainer_settings_no_check_in_days" CHECK ("trainer_settings"."no_check_in_days" between 1 and 60);--> statement-breakpoint
ALTER TABLE "trainer_settings" ADD CONSTRAINT "trainer_settings_no_measurement_days" CHECK ("trainer_settings"."no_measurement_days" between 1 and 180);