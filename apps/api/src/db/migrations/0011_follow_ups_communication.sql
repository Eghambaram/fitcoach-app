CREATE TABLE "communication_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"follow_up_id" uuid,
	"channel" text NOT NULL,
	"outcome" text NOT NULL,
	"note" text,
	"template_purpose" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_logs_channel" CHECK ("communication_logs"."channel" in ('whatsapp', 'call', 'email', 'in_person', 'other')),
	CONSTRAINT "communication_logs_outcome" CHECK ("communication_logs"."outcome" in ('message_sent', 'spoke', 'no_answer', 'left_message', 'replied', 'other')),
	CONSTRAINT "communication_logs_note_length" CHECK ("communication_logs"."note" is null or char_length("communication_logs"."note") <= 1000),
	CONSTRAINT "communication_logs_template_purpose" CHECK ("communication_logs"."template_purpose" is null or "communication_logs"."template_purpose" in ('follow_up', 'trial_confirmation', 'client_invite', 'payment_reminder', 'package_renewal', 'check_in_nudge', 'session_reminder')),
	CONSTRAINT "communication_logs_occurred_at" CHECK ("communication_logs"."occurred_at" <= "communication_logs"."created_at" + interval '5 minutes')
);
--> statement-breakpoint
CREATE TABLE "lead_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"reminder" text DEFAULT 'none' NOT NULL,
	"outcome" text,
	"outcome_note" text,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_follow_ups_workspace_lead_id_key" UNIQUE("workspace_id","lead_id","id"),
	CONSTRAINT "lead_follow_ups_action_type" CHECK ("lead_follow_ups"."action_type" in ('whatsapp', 'call', 'email', 'trial_confirmation', 'package_discussion', 'other')),
	CONSTRAINT "lead_follow_ups_status" CHECK ("lead_follow_ups"."status" in ('open', 'done', 'skipped')),
	CONSTRAINT "lead_follow_ups_reminder" CHECK ("lead_follow_ups"."reminder" in ('none', 'in_app')),
	CONSTRAINT "lead_follow_ups_outcome" CHECK ("lead_follow_ups"."outcome" is null or "lead_follow_ups"."outcome" in ('message_sent', 'spoke', 'no_answer', 'left_message', 'replied', 'other')),
	CONSTRAINT "lead_follow_ups_notes_length" CHECK ("lead_follow_ups"."notes" is null or char_length("lead_follow_ups"."notes") <= 500),
	CONSTRAINT "lead_follow_ups_outcome_note_length" CHECK ("lead_follow_ups"."outcome_note" is null or char_length("lead_follow_ups"."outcome_note") <= 500),
	CONSTRAINT "lead_follow_ups_completed" CHECK (("lead_follow_ups"."status" = 'open') = ("lead_follow_ups"."completed_at" is null)),
	CONSTRAINT "lead_follow_ups_done_outcome" CHECK ("lead_follow_ups"."status" <> 'done' or "lead_follow_ups"."outcome" is not null),
	CONSTRAINT "lead_follow_ups_open_no_outcome" CHECK ("lead_follow_ups"."status" <> 'open' or ("lead_follow_ups"."outcome" is null and "lead_follow_ups"."outcome_note" is null))
);
--> statement-breakpoint
ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_type";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "next_follow_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_follow_up_fk" FOREIGN KEY ("workspace_id","lead_id","follow_up_id") REFERENCES "public"."lead_follow_ups"("workspace_id","lead_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."leads"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communication_logs_workspace_lead_occurred_at_idx" ON "communication_logs" USING btree ("workspace_id","lead_id","occurred_at");--> statement-breakpoint
CREATE INDEX "communication_logs_workspace_follow_up_idx" ON "communication_logs" USING btree ("workspace_id","follow_up_id");--> statement-breakpoint
CREATE INDEX "communication_logs_actor_user_id_idx" ON "communication_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "lead_follow_ups_workspace_lead_status_idx" ON "lead_follow_ups" USING btree ("workspace_id","lead_id","status");--> statement-breakpoint
CREATE INDEX "lead_follow_ups_workspace_open_due_idx" ON "lead_follow_ups" USING btree ("workspace_id","due_at") WHERE "lead_follow_ups"."status" = 'open';--> statement-breakpoint
CREATE INDEX "lead_follow_ups_created_by_user_id_idx" ON "lead_follow_ups" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "lead_follow_ups_completed_by_user_id_idx" ON "lead_follow_ups" USING btree ("completed_by_user_id");--> statement-breakpoint
CREATE INDEX "leads_workspace_next_follow_up_at_idx" ON "leads" USING btree ("workspace_id","next_follow_up_at");--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_type" CHECK ("lead_activities"."type" in ('enquiry_received', 'created', 'details_updated', 'stage_changed', 'note', 'archived', 'restored', 'follow_up_scheduled', 'follow_up_rescheduled', 'follow_up_completed', 'follow_up_skipped'));