CREATE TABLE "client_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"channel" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_invites_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "client_invites_channel" CHECK ("client_invites"."channel" in ('whatsapp', 'email')),
	CONSTRAINT "client_invites_expiry" CHECK ("client_invites"."expires_at" > "client_invites"."created_at"),
	CONSTRAINT "client_invites_closed_once" CHECK ("client_invites"."consumed_at" is null or "client_invites"."revoked_at" is null)
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" DROP CONSTRAINT "auth_tokens_purpose";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "portal_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "client_invites" ADD CONSTRAINT "client_invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invites" ADD CONSTRAINT "client_invites_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_invites" ADD CONSTRAINT "client_invites_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_invites_workspace_client_idx" ON "client_invites" USING btree ("workspace_id","client_id","created_at");--> statement-breakpoint
CREATE INDEX "client_invites_created_by_user_id_idx" ON "client_invites" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "sessions_client_id_idx" ON "sessions" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_purpose" CHECK ("auth_tokens"."purpose" in ('verify_email', 'reset_password', 'email_otp'));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_client" CHECK (("sessions"."actor" = 'client') = ("sessions"."client_id" is not null and "sessions"."workspace_id" is not null));