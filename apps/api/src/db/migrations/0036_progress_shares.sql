CREATE TABLE "progress_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_shares_client_type_key" UNIQUE("client_id","type_id")
);
--> statement-breakpoint
ALTER TABLE "progress_shares" ADD CONSTRAINT "progress_shares_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_shares" ADD CONSTRAINT "progress_shares_type_id_measurement_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."measurement_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_shares" ADD CONSTRAINT "progress_shares_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_shares" ADD CONSTRAINT "progress_shares_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progress_shares_workspace_client_idx" ON "progress_shares" USING btree ("workspace_id","client_id");--> statement-breakpoint
CREATE INDEX "progress_shares_type_id_idx" ON "progress_shares" USING btree ("type_id");--> statement-breakpoint
CREATE INDEX "progress_shares_created_by_user_id_idx" ON "progress_shares" USING btree ("created_by_user_id");