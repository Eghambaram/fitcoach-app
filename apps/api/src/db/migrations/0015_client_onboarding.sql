CREATE TABLE "client_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"notice_version" integer NOT NULL,
	"notice_text" text NOT NULL,
	"source" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_consents_kind" CHECK ("client_consents"."kind" in ('data_processing', 'progress_photos')),
	CONSTRAINT "client_consents_status" CHECK ("client_consents"."status" in ('granted', 'declined', 'withdrawn')),
	CONSTRAINT "client_consents_notice_version" CHECK ("client_consents"."notice_version" > 0),
	CONSTRAINT "client_consents_notice_text_length" CHECK (char_length("client_consents"."notice_text") between 20 and 2000),
	CONSTRAINT "client_consents_source" CHECK ("client_consents"."source" in ('onboarding', 'client_portal')),
	CONSTRAINT "client_consents_actor_kind" CHECK ("client_consents"."actor_kind" in ('trainer', 'client'))
);
--> statement-breakpoint
CREATE TABLE "client_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"goal" text NOT NULL,
	"target_text" text,
	"target_date" date,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_goals_kind" CHECK ("client_goals"."kind" in ('primary', 'secondary')),
	CONSTRAINT "client_goals_goal" CHECK ("client_goals"."goal" in ('lose_weight', 'build_muscle', 'get_stronger', 'improve_fitness', 'sports_performance', 'other')),
	CONSTRAINT "client_goals_status" CHECK ("client_goals"."status" in ('active', 'achieved', 'dropped')),
	CONSTRAINT "client_goals_target_text_length" CHECK ("client_goals"."target_text" is null or char_length("client_goals"."target_text") <= 200)
);
--> statement-breakpoint
CREATE TABLE "client_onboarding_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"step" integer DEFAULT 1 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_onboarding_drafts_step" CHECK ("client_onboarding_drafts"."step" between 1 and 4),
	CONSTRAINT "client_onboarding_drafts_data_object" CHECK (jsonb_typeof("client_onboarding_drafts"."data") = 'object'),
	CONSTRAINT "client_onboarding_drafts_data_size" CHECK (octet_length("client_onboarding_drafts"."data"::text) <= 16384)
);
--> statement-breakpoint
CREATE TABLE "measurement_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"unit_kind" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurement_types_workspace_key" UNIQUE NULLS NOT DISTINCT("workspace_id","key"),
	CONSTRAINT "measurement_types_key_format" CHECK ("measurement_types"."key" ~ '^[a-z][a-z0-9_]{1,40}$'),
	CONSTRAINT "measurement_types_name_length" CHECK (char_length("measurement_types"."name") between 1 and 60),
	CONSTRAINT "measurement_types_unit_kind" CHECK ("measurement_types"."unit_kind" in ('mass', 'length', 'percent', 'count'))
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"value" numeric(9, 2) NOT NULL,
	"measured_on" date NOT NULL,
	"source" text NOT NULL,
	"note" text,
	"recorded_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measurements_value_positive" CHECK ("measurements"."value" > 0),
	CONSTRAINT "measurements_source" CHECK ("measurements"."source" in ('trainer', 'client')),
	CONSTRAINT "measurements_note_length" CHECK ("measurements"."note" is null or char_length("measurements"."note") <= 500),
	CONSTRAINT "measurements_void" CHECK (("measurements"."voided_at" is null) = ("measurements"."void_reason" is null) and ("measurements"."voided_at" is null or "measurements"."voided_by_user_id" is not null)),
	CONSTRAINT "measurements_void_reason_length" CHECK ("measurements"."void_reason" is null or char_length("measurements"."void_reason") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_type";--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "preferred_contact" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "experience_level" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "equipment" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "limitations" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_consents" ADD CONSTRAINT "client_consents_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_consents" ADD CONSTRAINT "client_consents_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_goals" ADD CONSTRAINT "client_goals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_goals" ADD CONSTRAINT "client_goals_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_onboarding_drafts" ADD CONSTRAINT "client_onboarding_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_onboarding_drafts" ADD CONSTRAINT "client_onboarding_drafts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_onboarding_drafts" ADD CONSTRAINT "client_onboarding_drafts_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_types" ADD CONSTRAINT "measurement_types_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_type_id_measurement_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."measurement_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_consents_workspace_client_idx" ON "client_consents" USING btree ("workspace_id","client_id","kind");--> statement-breakpoint
CREATE INDEX "client_consents_actor_user_id_idx" ON "client_consents" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_goals_active_primary_key" ON "client_goals" USING btree ("client_id") WHERE "client_goals"."kind" = 'primary' and "client_goals"."status" = 'active';--> statement-breakpoint
CREATE INDEX "client_goals_workspace_client_idx" ON "client_goals" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "client_goals_created_by_user_id_idx" ON "client_goals" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_onboarding_drafts_open_client_key" ON "client_onboarding_drafts" USING btree ("workspace_id","client_id") WHERE "client_onboarding_drafts"."finalized_at" is null and "client_onboarding_drafts"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "client_onboarding_drafts_workspace_open_idx" ON "client_onboarding_drafts" USING btree ("workspace_id","updated_at") WHERE "client_onboarding_drafts"."finalized_at" is null;--> statement-breakpoint
CREATE INDEX "client_onboarding_drafts_created_by_user_id_idx" ON "client_onboarding_drafts" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "measurements_workspace_client_type_idx" ON "measurements" USING btree ("workspace_id","client_id","type_id","measured_on");--> statement-breakpoint
CREATE INDEX "measurements_type_id_idx" ON "measurements" USING btree ("type_id");--> statement-breakpoint
CREATE INDEX "measurements_recorded_by_user_id_idx" ON "measurements" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "measurements_voided_by_user_id_idx" ON "measurements" USING btree ("voided_by_user_id");--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_type" CHECK ("activity_events"."type" in ('lead_converted', 'client_onboarded'));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_preferred_contact" CHECK ("clients"."preferred_contact" is null or "clients"."preferred_contact" in ('whatsapp', 'phone', 'email'));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_experience_level" CHECK ("clients"."experience_level" is null or "clients"."experience_level" in ('beginner', 'intermediate', 'advanced'));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_equipment_length" CHECK ("clients"."equipment" is null or char_length("clients"."equipment") <= 200);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_limitations_length" CHECK ("clients"."limitations" is null or char_length("clients"."limitations") <= 1000);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_onboarded" CHECK ("clients"."status" = 'onboarding_draft' or "clients"."onboarded_at" is not null);