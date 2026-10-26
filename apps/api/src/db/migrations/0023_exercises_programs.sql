CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"muscle_groups" text[] NOT NULL,
	"equipment" text[] NOT NULL,
	"difficulty" text DEFAULT 'beginner' NOT NULL,
	"instructions" text,
	"safety_notes" text,
	"media_url" text,
	"substitution_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "exercises_name_length" CHECK (char_length("exercises"."name") between 1 and 80),
	CONSTRAINT "exercises_category" CHECK ("exercises"."category" in ('strength', 'cardio', 'plyometric', 'mobility')),
	CONSTRAINT "exercises_muscle_groups" CHECK (cardinality("exercises"."muscle_groups") between 1 and 6 and "exercises"."muscle_groups" <@ array['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'glutes', 'quads', 'hamstrings', 'calves', 'hips', 'full_body']::text[]),
	CONSTRAINT "exercises_equipment" CHECK (cardinality("exercises"."equipment") between 1 and 5 and "exercises"."equipment" <@ array['bodyweight', 'barbell', 'dumbbell', 'kettlebell', 'band', 'cable', 'machine', 'bench', 'pull_up_bar', 'box', 'cardio_machine', 'mat']::text[]),
	CONSTRAINT "exercises_difficulty" CHECK ("exercises"."difficulty" in ('beginner', 'intermediate', 'advanced')),
	CONSTRAINT "exercises_instructions_length" CHECK (char_length("exercises"."instructions") <= 1500),
	CONSTRAINT "exercises_safety_notes_length" CHECK (char_length("exercises"."safety_notes") <= 600),
	CONSTRAINT "exercises_media_url" CHECK ("exercises"."media_url" is null or ("exercises"."media_url" like 'https://%' and char_length("exercises"."media_url") <= 500)),
	CONSTRAINT "exercises_global_not_archived" CHECK ("exercises"."workspace_id" is not null or "exercises"."archived_at" is null)
);
--> statement-breakpoint
CREATE TABLE "program_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"program_workout_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"position" smallint NOT NULL,
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
	CONSTRAINT "program_exercises_position_key" UNIQUE("program_workout_id","position"),
	CONSTRAINT "program_exercises_position" CHECK ("program_exercises"."position" >= 1),
	CONSTRAINT "program_exercises_sets" CHECK ("program_exercises"."sets" between 1 and 20),
	CONSTRAINT "program_exercises_target" CHECK (("program_exercises"."duration_seconds" is not null and "program_exercises"."reps_min" is null and "program_exercises"."reps_max" is null)
        or ("program_exercises"."duration_seconds" is null and "program_exercises"."reps_min" is not null)),
	CONSTRAINT "program_exercises_reps" CHECK ("program_exercises"."reps_min" is null or ("program_exercises"."reps_min" between 1 and 100 and coalesce("program_exercises"."reps_max", "program_exercises"."reps_min") between "program_exercises"."reps_min" and 100)),
	CONSTRAINT "program_exercises_duration" CHECK ("program_exercises"."duration_seconds" is null or "program_exercises"."duration_seconds" between 5 and 7200),
	CONSTRAINT "program_exercises_load" CHECK ("program_exercises"."target_load_kg" is null or "program_exercises"."target_load_kg" between 0 and 1000),
	CONSTRAINT "program_exercises_rest" CHECK ("program_exercises"."rest_seconds" is null or "program_exercises"."rest_seconds" between 0 and 900),
	CONSTRAINT "program_exercises_trainer_notes_length" CHECK (char_length("program_exercises"."trainer_notes") <= 500),
	CONSTRAINT "program_exercises_client_instructions_length" CHECK (char_length("program_exercises"."client_instructions") <= 500)
);
--> statement-breakpoint
CREATE TABLE "program_workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"day_number" smallint NOT NULL,
	"position" smallint NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_workouts_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "program_workouts_position_key" UNIQUE("program_id","position"),
	CONSTRAINT "program_workouts_name_length" CHECK (char_length("program_workouts"."name") between 1 and 80),
	CONSTRAINT "program_workouts_day_number" CHECK ("program_workouts"."day_number" between 1 and 7),
	CONSTRAINT "program_workouts_position" CHECK ("program_workouts"."position" >= 1),
	CONSTRAINT "program_workouts_notes_length" CHECK (char_length("program_workouts"."notes") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"goal" text,
	"duration_weeks" smallint NOT NULL,
	"days_per_week" smallint NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"source_program_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "programs_name_length" CHECK (char_length("programs"."name") between 1 and 80),
	CONSTRAINT "programs_description_length" CHECK (char_length("programs"."description") <= 1000),
	CONSTRAINT "programs_goal" CHECK ("programs"."goal" is null or "programs"."goal" in ('lose_weight', 'build_muscle', 'get_stronger', 'improve_fitness', 'sports_performance', 'other')),
	CONSTRAINT "programs_duration_weeks" CHECK ("programs"."duration_weeks" between 1 and 52),
	CONSTRAINT "programs_days_per_week" CHECK ("programs"."days_per_week" between 1 and 7),
	CONSTRAINT "programs_global_is_template" CHECK ("programs"."workspace_id" is not null or "programs"."is_template")
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_program_workout_id_program_workouts_id_fk" FOREIGN KEY ("program_workout_id") REFERENCES "public"."program_workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_exercises" ADD CONSTRAINT "program_exercises_workout_fk" FOREIGN KEY ("workspace_id","program_workout_id") REFERENCES "public"."program_workouts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_workouts" ADD CONSTRAINT "program_workouts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_workouts" ADD CONSTRAINT "program_workouts_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_workouts" ADD CONSTRAINT "program_workouts_program_fk" FOREIGN KEY ("workspace_id","program_id") REFERENCES "public"."programs"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_source_program_fk" FOREIGN KEY ("source_program_id") REFERENCES "public"."programs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_workspace_name_key" ON "exercises" USING btree ("workspace_id",lower("name")) NULLS NOT DISTINCT WHERE "exercises"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "exercises_created_by_user_id_idx" ON "exercises" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "program_exercises_workspace_id_idx" ON "program_exercises" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "program_exercises_exercise_id_idx" ON "program_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "program_workouts_workspace_id_idx" ON "program_workouts" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "programs_workspace_id_idx" ON "programs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "programs_source_program_id_idx" ON "programs" USING btree ("source_program_id");--> statement-breakpoint
CREATE INDEX "programs_created_by_user_id_idx" ON "programs" USING btree ("created_by_user_id");