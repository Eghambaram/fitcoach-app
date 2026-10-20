CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"uploaded_by_user_id" uuid,
	"kind" text NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"thumbnail_key" text,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"checksum" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"purged_at" timestamp with time zone,
	CONSTRAINT "files_object_key_key" UNIQUE("object_key"),
	CONSTRAINT "files_thumbnail_key_key" UNIQUE("thumbnail_key"),
	CONSTRAINT "files_kind" CHECK ("files"."kind" in ('trainer_avatar', 'public_page_photo', 'client_avatar')),
	CONSTRAINT "files_bucket" CHECK ("files"."bucket" in ('private', 'public')),
	CONSTRAINT "files_kind_bucket" CHECK (("files"."kind" = 'client_avatar' and "files"."bucket" = 'private') or ("files"."kind" <> 'client_avatar' and "files"."bucket" = 'public')),
	CONSTRAINT "files_mime_type" CHECK ("files"."mime_type" in ('image/webp')),
	CONSTRAINT "files_size_bytes" CHECK ("files"."size_bytes" > 0),
	CONSTRAINT "files_dimensions" CHECK ("files"."width" > 0 and "files"."height" > 0),
	CONSTRAINT "files_purged_after_delete" CHECK ("files"."purged_at" is null or "files"."deleted_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "avatar_file_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_workspace_id_idx" ON "files" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "files_uploaded_by_user_id_idx" ON "files" USING btree ("uploaded_by_user_id");--> statement-breakpoint
CREATE INDEX "files_deleted_at_idx" ON "files" USING btree ("deleted_at") WHERE "files"."purged_at" is null;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_avatar_file_id_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_avatar_file_id_idx" ON "profiles" USING btree ("avatar_file_id");