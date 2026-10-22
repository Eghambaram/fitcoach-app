ALTER TABLE "lead_activities" DROP CONSTRAINT "lead_activities_type";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "interested_service" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "nurture_until" date;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "leads_full_name_trgm_idx" ON "leads" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "leads_email_trgm_idx" ON "leads" USING gin (("email"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "leads_phone_trgm_idx" ON "leads" USING gin ("phone_e164" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_note_body" CHECK ("lead_activities"."type" <> 'note' or char_length("lead_activities"."data" ->> 'body') between 1 and 2000);--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_type" CHECK ("lead_activities"."type" in ('enquiry_received', 'created', 'details_updated', 'stage_changed', 'note', 'archived', 'restored'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_location_length" CHECK ("leads"."location" is null or char_length("leads"."location") <= 120);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_interested_service_length" CHECK ("leads"."interested_service" is null or char_length("leads"."interested_service") <= 120);--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_lost_reason" CHECK ("leads"."lost_reason" is null or "leads"."lost_reason" in ('price', 'timing', 'location', 'chose_another_coach', 'no_response', 'not_a_fit', 'other'));--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_lost_fields_only_when_lost" CHECK ("leads"."stage" = 'lost' or ("leads"."lost_reason" is null and "leads"."nurture_until" is null));