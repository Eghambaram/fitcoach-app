CREATE TABLE "workout_session_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workout_session_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"exercise_id" uuid NOT NULL,
	"planned_exercise_id" uuid,
	"sets" smallint NOT NULL,
	"reps_min" smallint,
	"reps_max" smallint,
	"duration_seconds" integer,
	"target_load_kg" numeric(6, 2),
	"rest_seconds" smallint,
	"trainer_notes" text,
	"client_instructions" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_session_exercises_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "workout_session_exercises_position_key" UNIQUE("workout_session_id","position"),
	CONSTRAINT "workout_session_exercises_position" CHECK ("workout_session_exercises"."position" between 1 and 40),
	CONSTRAINT "workout_session_exercises_sets" CHECK ("workout_session_exercises"."sets" between 1 and 20),
	CONSTRAINT "workout_session_exercises_target" CHECK (("workout_session_exercises"."duration_seconds" is not null and "workout_session_exercises"."reps_min" is null and "workout_session_exercises"."reps_max" is null)
        or ("workout_session_exercises"."duration_seconds" is null and "workout_session_exercises"."reps_min" is not null)),
	CONSTRAINT "workout_session_exercises_reps" CHECK ("workout_session_exercises"."reps_min" is null or ("workout_session_exercises"."reps_min" between 1 and 100 and coalesce("workout_session_exercises"."reps_max", "workout_session_exercises"."reps_min") between "workout_session_exercises"."reps_min" and 100)),
	CONSTRAINT "workout_session_exercises_duration" CHECK ("workout_session_exercises"."duration_seconds" is null or "workout_session_exercises"."duration_seconds" between 5 and 7200),
	CONSTRAINT "workout_session_exercises_load" CHECK ("workout_session_exercises"."target_load_kg" is null or "workout_session_exercises"."target_load_kg" between 0 and 1000),
	CONSTRAINT "workout_session_exercises_rest" CHECK ("workout_session_exercises"."rest_seconds" is null or "workout_session_exercises"."rest_seconds" between 0 and 900),
	CONSTRAINT "workout_session_exercises_trainer_notes_length" CHECK (char_length("workout_session_exercises"."trainer_notes") <= 500),
	CONSTRAINT "workout_session_exercises_client_instructions_length" CHECK (char_length("workout_session_exercises"."client_instructions") <= 500)
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"workout_session_exercise_id" uuid NOT NULL,
	"set_number" smallint NOT NULL,
	"reps" smallint,
	"load_kg" numeric(6, 2),
	"duration_seconds" integer,
	"rpe" numeric(3, 1),
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_sets_set_number_key" UNIQUE("workout_session_exercise_id","set_number"),
	CONSTRAINT "workout_sets_set_number" CHECK ("workout_sets"."set_number" between 1 and 20),
	CONSTRAINT "workout_sets_reps" CHECK ("workout_sets"."reps" is null or "workout_sets"."reps" between 0 and 200),
	CONSTRAINT "workout_sets_load" CHECK ("workout_sets"."load_kg" is null or "workout_sets"."load_kg" between 0 and 1000),
	CONSTRAINT "workout_sets_duration" CHECK ("workout_sets"."duration_seconds" is null or "workout_sets"."duration_seconds" between 0 and 7200),
	CONSTRAINT "workout_sets_rpe" CHECK ("workout_sets"."rpe" is null or "workout_sets"."rpe" between 1 and 10),
	CONSTRAINT "workout_sets_completed" CHECK ("workout_sets"."completed" = ("workout_sets"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "appointment_id" uuid;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "trainer_feedback" text;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "skip_reason" text;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_planned_exercise_id_exercises_id_fk" FOREIGN KEY ("planned_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_exercises" ADD CONSTRAINT "workout_session_exercises_session_fk" FOREIGN KEY ("workspace_id","workout_session_id") REFERENCES "public"."workout_sessions"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_exercise_fk" FOREIGN KEY ("workspace_id","workout_session_exercise_id") REFERENCES "public"."workout_session_exercises"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_session_exercises_exercise_id_idx" ON "workout_session_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "workout_session_exercises_planned_exercise_id_idx" ON "workout_session_exercises" USING btree ("planned_exercise_id");--> statement-breakpoint
CREATE INDEX "workout_sets_workspace_id_idx" ON "workout_sets" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_appointment_fk" FOREIGN KEY ("workspace_id","appointment_id") REFERENCES "public"."appointments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_appointment_key" ON "workout_sessions" USING btree ("appointment_id") WHERE "workout_sessions"."appointment_id" is not null;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_trainer_feedback_length" CHECK (char_length("workout_sessions"."trainer_feedback") <= 1000);--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_skip_reason_length" CHECK (char_length("workout_sessions"."skip_reason") <= 200);--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_lifecycle" CHECK (("workout_sessions"."status" = 'planned' and "workout_sessions"."started_at" is null and "workout_sessions"."completed_at" is null)
        or ("workout_sessions"."status" = 'in_progress' and "workout_sessions"."started_at" is not null and "workout_sessions"."completed_at" is null)
        or ("workout_sessions"."status" = 'completed' and "workout_sessions"."started_at" is not null and "workout_sessions"."completed_at" is not null)
        or ("workout_sessions"."status" = 'skipped' and "workout_sessions"."completed_at" is null));