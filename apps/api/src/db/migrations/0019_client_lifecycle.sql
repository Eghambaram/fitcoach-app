CREATE TABLE "client_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_notes_body_length" CHECK (char_length("client_notes"."body") between 1 and 2000)
);
--> statement-breakpoint
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_type";--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_notes_workspace_client_created_at_idx" ON "client_notes" USING btree ("workspace_id","client_id","created_at");--> statement-breakpoint
CREATE INDEX "client_notes_author_user_id_idx" ON "client_notes" USING btree ("author_user_id");--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_type" CHECK ("activity_events"."type" in ('lead_converted', 'client_onboarded', 'client_paused', 'client_resumed', 'client_archived', 'client_restored'));