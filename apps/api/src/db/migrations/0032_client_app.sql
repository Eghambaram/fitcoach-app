ALTER TABLE "clients" ADD COLUMN "weight_unit" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "length_unit" text;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "client_feedback" text;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_weight_unit" CHECK ("clients"."weight_unit" is null or "clients"."weight_unit" in ('kg', 'lb'));--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_length_unit" CHECK ("clients"."length_unit" is null or "clients"."length_unit" in ('cm', 'in'));--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_client_feedback_length" CHECK (char_length("workout_sessions"."client_feedback") <= 1000);