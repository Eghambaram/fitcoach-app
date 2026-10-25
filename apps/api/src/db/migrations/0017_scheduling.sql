CREATE TABLE "appointment_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"appointment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_changes_kind" CHECK ("appointment_changes"."kind" in ('created', 'rescheduled', 'cancelled', 'attendance', 'notes')),
	CONSTRAINT "appointment_changes_data_object" CHECK (jsonb_typeof("appointment_changes"."data") = 'object')
);
--> statement-breakpoint
CREATE TABLE "appointment_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"weekdays" smallint[] NOT NULL,
	"start_time" time NOT NULL,
	"duration_min" integer NOT NULL,
	"timezone" text NOT NULL,
	"location" text,
	"meeting_url" text,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"occurrence_count" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_series_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "appointment_series_kind" CHECK ("appointment_series"."kind" in ('session', 'online_session')),
	CONSTRAINT "appointment_series_weekdays" CHECK (cardinality("appointment_series"."weekdays") between 1 and 7 and "appointment_series"."weekdays" <@ array[1,2,3,4,5,6,7]::smallint[]),
	CONSTRAINT "appointment_series_duration" CHECK ("appointment_series"."duration_min" between 15 and 480),
	CONSTRAINT "appointment_series_end" CHECK ("appointment_series"."ends_on" is not null or "appointment_series"."occurrence_count" is not null),
	CONSTRAINT "appointment_series_occurrences" CHECK ("appointment_series"."occurrence_count" is null or "appointment_series"."occurrence_count" between 1 and 52),
	CONSTRAINT "appointment_series_dates" CHECK ("appointment_series"."ends_on" is null or "appointment_series"."ends_on" >= "appointment_series"."starts_on"),
	CONSTRAINT "appointment_series_status" CHECK ("appointment_series"."status" in ('active', 'ended')),
	CONSTRAINT "appointment_series_location_length" CHECK ("appointment_series"."location" is null or char_length("appointment_series"."location") <= 120),
	CONSTRAINT "appointment_series_meeting_url" CHECK ("appointment_series"."meeting_url" is null or ("appointment_series"."meeting_url" ~ '^https?://' and char_length("appointment_series"."meeting_url") <= 300))
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid,
	"lead_id" uuid,
	"series_id" uuid,
	"kind" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"location" text,
	"meeting_url" text,
	"notes" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"late_cancel" boolean DEFAULT false NOT NULL,
	"attendance_marked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointments_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "appointments_one_person" CHECK (num_nonnulls("appointments"."client_id", "appointments"."lead_id") = 1),
	CONSTRAINT "appointments_kind" CHECK ("appointments"."kind" in ('session', 'online_session', 'trial', 'consultation')),
	CONSTRAINT "appointments_status" CHECK ("appointments"."status" in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
	CONSTRAINT "appointments_duration" CHECK ("appointments"."duration_min" between 15 and 480),
	CONSTRAINT "appointments_cancelled" CHECK (("appointments"."status" = 'cancelled') = ("appointments"."cancelled_at" is not null and "appointments"."cancel_reason" is not null)),
	CONSTRAINT "appointments_late_cancel" CHECK (not "appointments"."late_cancel" or "appointments"."status" = 'cancelled'),
	CONSTRAINT "appointments_attendance" CHECK ("appointments"."status" not in ('completed', 'no_show') or "appointments"."attendance_marked_at" is not null),
	CONSTRAINT "appointments_cancel_reason_length" CHECK ("appointments"."cancel_reason" is null or char_length("appointments"."cancel_reason") between 1 and 200),
	CONSTRAINT "appointments_location_length" CHECK ("appointments"."location" is null or char_length("appointments"."location") <= 120),
	CONSTRAINT "appointments_meeting_url" CHECK ("appointments"."meeting_url" is null or ("appointments"."meeting_url" ~ '^https?://' and char_length("appointments"."meeting_url") <= 300)),
	CONSTRAINT "appointments_notes_length" CHECK ("appointments"."notes" is null or char_length("appointments"."notes") <= 2000),
	CONSTRAINT "appointments_timezone_length" CHECK (char_length("appointments"."timezone") between 1 and 64)
);
--> statement-breakpoint
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_type";--> statement-breakpoint
ALTER TABLE "appointment_changes" ADD CONSTRAINT "appointment_changes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_changes" ADD CONSTRAINT "appointment_changes_appointment_fk" FOREIGN KEY ("workspace_id","appointment_id") REFERENCES "public"."appointments"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_series" ADD CONSTRAINT "appointment_series_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_series_fk" FOREIGN KEY ("workspace_id","series_id") REFERENCES "public"."appointment_series"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "appointment_changes_workspace_appointment_idx" ON "appointment_changes" USING btree ("workspace_id","appointment_id","created_at");--> statement-breakpoint
CREATE INDEX "appointment_changes_actor_user_id_idx" ON "appointment_changes" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "appointment_series_workspace_client_idx" ON "appointment_series" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "appointment_series_created_by_user_id_idx" ON "appointment_series" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "appointments_workspace_starts_at_idx" ON "appointments" USING btree ("workspace_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_workspace_client_idx" ON "appointments" USING btree ("workspace_id","client_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_workspace_lead_idx" ON "appointments" USING btree ("workspace_id","lead_id");--> statement-breakpoint
CREATE INDEX "appointments_workspace_series_idx" ON "appointments" USING btree ("workspace_id","series_id","starts_at");--> statement-breakpoint
CREATE INDEX "appointments_created_by_user_id_idx" ON "appointments" USING btree ("created_by_user_id");--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_type" CHECK ("lead_activities"."type" in ('enquiry_received', 'created', 'details_updated', 'stage_changed', 'note', 'archived', 'restored', 'follow_up_scheduled', 'follow_up_rescheduled', 'follow_up_completed', 'follow_up_skipped', 'converted', 'trial_booked', 'trial_completed', 'trial_no_show', 'trial_cancelled'));