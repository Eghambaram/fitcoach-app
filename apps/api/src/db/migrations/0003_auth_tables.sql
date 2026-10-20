CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "auth_tokens_purpose" CHECK ("auth_tokens"."purpose" in ('verify_email', 'reset_password'))
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"phone_e164" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_kind" CHECK ("profiles"."kind" in ('trainer', 'client')),
	CONSTRAINT "profiles_display_name_length" CHECK (char_length("profiles"."display_name") between 1 and 80),
	CONSTRAINT "profiles_phone_e164" CHECK ("profiles"."phone_e164" is null or "profiles"."phone_e164" ~ '^\+[1-9][0-9]{6,14}$')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"workspace_id" uuid,
	"aal" smallint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "sessions_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "sessions_actor" CHECK ("sessions"."actor" in ('trainer', 'client', 'platform_owner')),
	CONSTRAINT "sessions_aal" CHECK ("sessions"."aal" in (1, 2)),
	CONSTRAINT "sessions_revoked_reason" CHECK ("sessions"."revoked_reason" is null or "sessions"."revoked_reason" in ('logout', 'user_revoked', 'password_reset', 'password_changed', 'archived', 'suspended', 'admin_revoked')),
	CONSTRAINT "sessions_user_agent_length" CHECK ("sessions"."user_agent" is null or char_length("sessions"."user_agent") <= 300)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_key" UNIQUE("email"),
	CONSTRAINT "users_status" CHECK ("users"."status" in ('active', 'disabled')),
	CONSTRAINT "users_email_length" CHECK (char_length("users"."email") between 3 and 254)
);
--> statement-breakpoint
CREATE TABLE "beta_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"label" text,
	"max_uses" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beta_invites_code_hash_key" UNIQUE("code_hash"),
	CONSTRAINT "beta_invites_max_uses" CHECK ("beta_invites"."max_uses" between 1 and 1000),
	CONSTRAINT "beta_invites_uses" CHECK ("beta_invites"."uses" between 0 and "beta_invites"."max_uses"),
	CONSTRAINT "beta_invites_label_length" CHECK ("beta_invites"."label" is null or char_length("beta_invites"."label") <= 80)
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"user_id" uuid,
	"workspace_id" uuid,
	"provider" text NOT NULL,
	"provider_message_id" text,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_deliveries_channel" CHECK ("notification_deliveries"."channel" in ('email')),
	CONSTRAINT "notification_deliveries_status" CHECK ("notification_deliveries"."status" in ('sent', 'failed')),
	CONSTRAINT "notification_deliveries_error_length" CHECK ("notification_deliveries"."error" is null or char_length("notification_deliveries"."error") <= 500)
);
--> statement-breakpoint
CREATE TABLE "platform_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"granted_by" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "platform_roles_user_id_role_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "platform_roles_role" CHECK ("platform_roles"."role" in ('platform_owner'))
);
--> statement-breakpoint
CREATE TABLE "product_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event" text NOT NULL,
	"actor_kind" text NOT NULL,
	"user_id" uuid,
	"workspace_id" uuid,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "product_events_event_format" CHECK ("product_events"."event" ~ '^[a-z][a-z0-9_]{2,60}$'),
	CONSTRAINT "product_events_actor_kind" CHECK ("product_events"."actor_kind" in ('trainer', 'client', 'platform_owner', 'system'))
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"purpose" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_workspace_purpose_key" UNIQUE NULLS NOT DISTINCT("workspace_id","purpose"),
	CONSTRAINT "message_templates_purpose" CHECK ("message_templates"."purpose" in ('follow_up', 'trial_confirmation', 'client_invite', 'payment_reminder', 'package_renewal', 'check_in_nudge', 'session_reminder')),
	CONSTRAINT "message_templates_body_length" CHECK (char_length("message_templates"."body") between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "package_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"sessions_included" integer,
	"duration_days" integer,
	"sessions_per_week" integer,
	"default_price_paise" bigint,
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_presets_kind" CHECK ("package_presets"."kind" in ('session_pack', 'time_based', 'online_coaching')),
	CONSTRAINT "package_presets_name_length" CHECK (char_length("package_presets"."name") between 1 and 80),
	CONSTRAINT "package_presets_sessions_included" CHECK ("package_presets"."sessions_included" is null or "package_presets"."sessions_included" > 0),
	CONSTRAINT "package_presets_session_pack_needs_sessions" CHECK ("package_presets"."kind" <> 'session_pack' or "package_presets"."sessions_included" is not null),
	CONSTRAINT "package_presets_duration_days" CHECK ("package_presets"."duration_days" is null or "package_presets"."duration_days" between 1 and 730),
	CONSTRAINT "package_presets_sessions_per_week" CHECK ("package_presets"."sessions_per_week" is null or "package_presets"."sessions_per_week" between 1 and 14),
	CONSTRAINT "package_presets_price" CHECK ("package_presets"."default_price_paise" is null or "package_presets"."default_price_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"max_active_clients" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_id_format" CHECK ("subscription_plans"."id" ~ '^[a-z0-9_]{2,40}$'),
	CONSTRAINT "subscription_plans_max_active_clients" CHECK ("subscription_plans"."max_active_clients" is null or "subscription_plans"."max_active_clients" > 0)
);
--> statement-breakpoint
CREATE TABLE "trainer_settings" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"weight_unit" text DEFAULT 'kg' NOT NULL,
	"length_unit" text DEFAULT 'cm' NOT NULL,
	"no_show_uses_session" boolean DEFAULT true NOT NULL,
	"late_cancel_window_hours" integer DEFAULT 12 NOT NULL,
	"late_cancel_uses_session" boolean DEFAULT true NOT NULL,
	"low_sessions_threshold" integer DEFAULT 2 NOT NULL,
	"expiry_warning_days" integer DEFAULT 7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainer_settings_weight_unit" CHECK ("trainer_settings"."weight_unit" in ('kg', 'lb')),
	CONSTRAINT "trainer_settings_length_unit" CHECK ("trainer_settings"."length_unit" in ('cm', 'in')),
	CONSTRAINT "trainer_settings_late_cancel_window" CHECK ("trainer_settings"."late_cancel_window_hours" between 0 and 168),
	CONSTRAINT "trainer_settings_low_sessions" CHECK ("trainer_settings"."low_sessions_threshold" between 0 and 50),
	CONSTRAINT "trainer_settings_expiry_warning" CHECK ("trainer_settings"."expiry_warning_days" between 0 and 60)
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "workspace_members_user_id_key" UNIQUE("user_id"),
	CONSTRAINT "workspace_members_role" CHECK ("workspace_members"."role" in ('owner'))
);
--> statement-breakpoint
CREATE TABLE "workspace_plans" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"max_active_clients" integer NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"assigned_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_plans_max_active_clients" CHECK ("workspace_plans"."max_active_clients" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"slug" "citext" NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"city" text,
	"coaching_modes" text[] NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"country" text DEFAULT 'IN' NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_key" UNIQUE("slug"),
	CONSTRAINT "workspaces_status" CHECK ("workspaces"."status" in ('pending_approval', 'trialing', 'active', 'past_due', 'suspended', 'cancelled')),
	CONSTRAINT "workspaces_slug_format" CHECK ("workspaces"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length("workspaces"."slug") between 3 and 40),
	CONSTRAINT "workspaces_name_length" CHECK (char_length("workspaces"."name") between 2 and 80),
	CONSTRAINT "workspaces_city_length" CHECK ("workspaces"."city" is null or char_length("workspaces"."city") <= 80),
	CONSTRAINT "workspaces_coaching_modes" CHECK (cardinality("workspaces"."coaching_modes") between 1 and 3 and "workspaces"."coaching_modes" <@ array['in_person', 'online', 'hybrid']::text[]),
	CONSTRAINT "workspaces_country" CHECK ("workspaces"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "workspaces_currency" CHECK ("workspaces"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_events" ADD CONSTRAINT "product_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_presets" ADD CONSTRAINT "package_presets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_settings" ADD CONSTRAINT "trainer_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_plans" ADD CONSTRAINT "workspace_plans_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_plans" ADD CONSTRAINT "workspace_plans_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_plans" ADD CONSTRAINT "workspace_plans_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_tokens_user_id_purpose_idx" ON "auth_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_workspace_id_idx" ON "sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "notification_deliveries_user_id_idx" ON "notification_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_workspace_id_idx" ON "notification_deliveries" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "product_events_event_occurred_at_idx" ON "product_events" USING btree ("event","occurred_at");--> statement-breakpoint
CREATE INDEX "product_events_workspace_id_occurred_at_idx" ON "product_events" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "package_presets_workspace_id_idx" ON "package_presets" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_plans_plan_id_idx" ON "workspace_plans" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "workspace_plans_assigned_by_user_id_idx" ON "workspace_plans" USING btree ("assigned_by_user_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_user_id_idx" ON "workspaces" USING btree ("owner_user_id");