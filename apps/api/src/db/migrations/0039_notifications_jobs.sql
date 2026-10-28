CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	CONSTRAINT "job_runs_status" CHECK ("job_runs"."status" in ('succeeded', 'failed')),
	CONSTRAINT "job_runs_name_length" CHECK (char_length("job_runs"."name") between 1 and 80),
	CONSTRAINT "job_runs_error_length" CHECK ("job_runs"."error" is null or char_length("job_runs"."error") <= 1000),
	CONSTRAINT "job_runs_summary_object" CHECK (jsonb_typeof("job_runs"."summary") = 'object')
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
CREATE INDEX "job_runs_name_started_at_idx" ON "job_runs" USING btree ("name","started_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_dedupe_key" UNIQUE("recipient_user_id","dedupe_key");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_dedupe_key_length" CHECK ("notifications"."dedupe_key" is null or char_length("notifications"."dedupe_key") between 1 and 120);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type" CHECK ("notifications"."type" in ('new_lead', 'follow_up_due', 'trial_soon', 'attendance_needed', 'package_expiring', 'package_low', 'payment_due', 'check_in_submitted', 'invite_accepted', 'program_assigned', 'session_booked', 'session_changed', 'session_cancelled'));