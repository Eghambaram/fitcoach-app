CREATE TABLE "platform_mfa" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"enabled_at" timestamp with time zone,
	"last_time_step" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_mfa_ciphertext_length" CHECK (char_length("platform_mfa"."secret_ciphertext") <= 500)
);
--> statement-breakpoint
CREATE TABLE "platform_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_recovery_codes_code_hash_key" UNIQUE("code_hash")
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_type";--> statement-breakpoint
ALTER TABLE "platform_mfa" ADD CONSTRAINT "platform_mfa_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_recovery_codes" ADD CONSTRAINT "platform_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_recovery_codes_user_id_idx" ON "platform_recovery_codes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_type" CHECK ("notifications"."type" in ('new_lead', 'follow_up_due', 'trial_soon', 'attendance_needed', 'package_expiring', 'package_low', 'payment_due', 'check_in_submitted', 'invite_accepted', 'program_assigned', 'session_booked', 'session_changed', 'session_cancelled', 'account_approved', 'workspace_suspended', 'workspace_reactivated'));