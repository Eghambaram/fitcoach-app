CREATE TABLE "backup_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"object_key" text,
	"size_bytes" bigint,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backup_runs_status" CHECK ("backup_runs"."status" in ('succeeded', 'failed')),
	CONSTRAINT "backup_runs_succeeded" CHECK ("backup_runs"."status" <> 'succeeded' or ("backup_runs"."object_key" is not null and "backup_runs"."size_bytes" > 0)),
	CONSTRAINT "backup_runs_object_key" CHECK ("backup_runs"."object_key" is null or "backup_runs"."object_key" ~ '^([a-z0-9-]+/)?backups/(daily|weekly)/'),
	CONSTRAINT "backup_runs_error_length" CHECK ("backup_runs"."error" is null or char_length("backup_runs"."error") <= 1000),
	CONSTRAINT "backup_runs_order" CHECK ("backup_runs"."finished_at" >= "backup_runs"."started_at")
);
--> statement-breakpoint
CREATE INDEX "backup_runs_finished_at_idx" ON "backup_runs" USING btree ("finished_at");