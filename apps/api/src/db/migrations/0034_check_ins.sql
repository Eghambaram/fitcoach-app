CREATE TABLE "check_in_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"check_in_id" uuid NOT NULL,
	"previous" jsonb NOT NULL,
	"revised_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_in_revisions_previous" CHECK (jsonb_typeof("check_in_revisions"."previous") = 'object')
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"feeling" text NOT NULL,
	"energy" smallint NOT NULL,
	"sleep" smallint NOT NULL,
	"soreness" text NOT NULL,
	"notes" text,
	"workout_feedback" text,
	"revisions" integer DEFAULT 0 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"reply" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_ins_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "check_ins_client_local_date_key" UNIQUE("client_id","local_date"),
	CONSTRAINT "check_ins_feeling" CHECK ("check_ins"."feeling" in ('great', 'good', 'okay', 'tired', 'poor')),
	CONSTRAINT "check_ins_energy" CHECK ("check_ins"."energy" between 1 and 10),
	CONSTRAINT "check_ins_sleep" CHECK ("check_ins"."sleep" between 1 and 10),
	CONSTRAINT "check_ins_soreness" CHECK ("check_ins"."soreness" in ('none', 'mild', 'moderate', 'high')),
	CONSTRAINT "check_ins_notes_length" CHECK (char_length("check_ins"."notes") <= 1000),
	CONSTRAINT "check_ins_workout_feedback_length" CHECK (char_length("check_ins"."workout_feedback") <= 1000),
	CONSTRAINT "check_ins_reply_length" CHECK (char_length("check_ins"."reply") <= 1000),
	CONSTRAINT "check_ins_reviewed" CHECK (("check_ins"."reviewed_at" is null) = ("check_ins"."reviewed_by_user_id" is null))
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "check_in_days" smallint[];--> statement-breakpoint
ALTER TABLE "check_in_revisions" ADD CONSTRAINT "check_in_revisions_check_in_fk" FOREIGN KEY ("workspace_id","check_in_id") REFERENCES "public"."check_ins"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_in_revisions_workspace_check_in_idx" ON "check_in_revisions" USING btree ("workspace_id","check_in_id");--> statement-breakpoint
CREATE INDEX "check_ins_workspace_reviewed_idx" ON "check_ins" USING btree ("workspace_id","reviewed_at","local_date");--> statement-breakpoint
CREATE INDEX "check_ins_workspace_client_date_idx" ON "check_ins" USING btree ("workspace_id","client_id","local_date");--> statement-breakpoint
CREATE INDEX "check_ins_reviewed_by_user_id_idx" ON "check_ins" USING btree ("reviewed_by_user_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_check_in_days" CHECK ("clients"."check_in_days" is null or (cardinality("clients"."check_in_days") between 1 and 7 and "clients"."check_in_days" <@ array[1,2,3,4,5,6,7]::smallint[]));