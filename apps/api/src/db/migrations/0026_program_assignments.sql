CREATE TABLE "client_program_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"program_id" uuid,
	"name" text NOT NULL,
	"program_snapshot" jsonb NOT NULL,
	"schedule" jsonb NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"instructions" text,
	"equipment_notes" text,
	"ended_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_program_assignments_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "client_program_assignments_name_length" CHECK (char_length("client_program_assignments"."name") between 1 and 80),
	CONSTRAINT "client_program_assignments_status" CHECK ("client_program_assignments"."status" in ('active', 'completed', 'ended')),
	CONSTRAINT "client_program_assignments_dates" CHECK ("client_program_assignments"."ends_on" >= "client_program_assignments"."starts_on"),
	CONSTRAINT "client_program_assignments_ended" CHECK (("client_program_assignments"."status" = 'active') = ("client_program_assignments"."ended_at" is null)),
	CONSTRAINT "client_program_assignments_schedule" CHECK (jsonb_typeof("client_program_assignments"."schedule") = 'array' and jsonb_array_length("client_program_assignments"."schedule") between 1 and 7),
	CONSTRAINT "client_program_assignments_instructions_length" CHECK (char_length("client_program_assignments"."instructions") <= 1000),
	CONSTRAINT "client_program_assignments_equipment_notes_length" CHECK (char_length("client_program_assignments"."equipment_notes") <= 500)
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"workout_index" smallint NOT NULL,
	"name" text NOT NULL,
	"scheduled_on" date NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_sessions_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "workout_sessions_slot_key" UNIQUE("assignment_id","scheduled_on","workout_index"),
	CONSTRAINT "workout_sessions_workout_index" CHECK ("workout_sessions"."workout_index" between 0 and 6),
	CONSTRAINT "workout_sessions_name_length" CHECK (char_length("workout_sessions"."name") between 1 and 80),
	CONSTRAINT "workout_sessions_status" CHECK ("workout_sessions"."status" in ('planned', 'in_progress', 'completed', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "client_program_assignments" ADD CONSTRAINT "client_program_assignments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_program_assignments" ADD CONSTRAINT "client_program_assignments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_program_assignments" ADD CONSTRAINT "client_program_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_program_assignments" ADD CONSTRAINT "client_program_assignments_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_assignment_fk" FOREIGN KEY ("workspace_id","assignment_id") REFERENCES "public"."client_program_assignments"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_program_assignments_one_active_key" ON "client_program_assignments" USING btree ("workspace_id","client_id") WHERE "client_program_assignments"."status" = 'active';--> statement-breakpoint
CREATE INDEX "client_program_assignments_program_id_idx" ON "client_program_assignments" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "client_program_assignments_created_by_user_id_idx" ON "client_program_assignments" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "workout_sessions_workspace_client_scheduled_on_idx" ON "workout_sessions" USING btree ("workspace_id","client_id","scheduled_on");