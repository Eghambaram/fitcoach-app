CREATE TABLE "client_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"preset_id" uuid,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"sessions_included" integer,
	"sessions_per_week" integer,
	"starts_on" date NOT NULL,
	"expires_on" date,
	"price_paise" bigint NOT NULL,
	"amount_due_paise" bigint NOT NULL,
	"payment_due_on" date,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"closed_at" timestamp with time zone,
	"closed_reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_packages_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "client_packages_kind" CHECK ("client_packages"."kind" in ('session_pack', 'time_based', 'online_coaching')),
	CONSTRAINT "client_packages_status" CHECK ("client_packages"."status" in ('active', 'completed', 'expired', 'cancelled')),
	CONSTRAINT "client_packages_name_length" CHECK (char_length("client_packages"."name") between 1 and 80),
	CONSTRAINT "client_packages_sessions_included" CHECK ("client_packages"."sessions_included" is null or "client_packages"."sessions_included" between 1 and 500),
	CONSTRAINT "client_packages_session_pack_needs_sessions" CHECK ("client_packages"."kind" <> 'session_pack' or "client_packages"."sessions_included" is not null),
	CONSTRAINT "client_packages_sessions_per_week" CHECK ("client_packages"."sessions_per_week" is null or "client_packages"."sessions_per_week" between 1 and 14),
	CONSTRAINT "client_packages_dates" CHECK ("client_packages"."expires_on" is null or "client_packages"."expires_on" >= "client_packages"."starts_on"),
	CONSTRAINT "client_packages_money" CHECK ("client_packages"."price_paise" between 0 and 100000000 and "client_packages"."amount_due_paise" between 0 and "client_packages"."price_paise"),
	CONSTRAINT "client_packages_closed" CHECK (("client_packages"."status" = 'active') = ("client_packages"."closed_at" is null)),
	CONSTRAINT "client_packages_notes_length" CHECK (char_length("client_packages"."notes") <= 500),
	CONSTRAINT "client_packages_closed_reason_length" CHECK (char_length("client_packages"."closed_reason") <= 200)
);
--> statement-breakpoint
CREATE TABLE "client_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"method" text NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"note" text,
	"voids_id" uuid,
	"void_reason" text,
	"recorded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_payments_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "client_payments_voids_key" UNIQUE("voids_id"),
	CONSTRAINT "client_payments_amount" CHECK ("client_payments"."amount_paise" between 1 and 100000000),
	CONSTRAINT "client_payments_method" CHECK ("client_payments"."method" in ('cash', 'upi', 'bank_transfer', 'card', 'other')),
	CONSTRAINT "client_payments_void" CHECK (("client_payments"."voids_id" is null) = ("client_payments"."void_reason" is null)),
	CONSTRAINT "client_payments_reference_length" CHECK (char_length("client_payments"."reference") <= 80),
	CONSTRAINT "client_payments_note_length" CHECK (char_length("client_payments"."note") <= 300),
	CONSTRAINT "client_payments_void_reason_length" CHECK (char_length("client_payments"."void_reason") between 1 and 200)
);
--> statement-breakpoint
CREATE TABLE "package_session_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"appointment_id" uuid,
	"reason" text NOT NULL,
	"sessions_used" integer NOT NULL,
	"mark_no" integer,
	"reverses_id" uuid,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_session_ledger_workspace_id_id_key" UNIQUE("workspace_id","id"),
	CONSTRAINT "package_session_ledger_mark_key" UNIQUE("package_id","appointment_id","mark_no"),
	CONSTRAINT "package_session_ledger_reverses_key" UNIQUE("reverses_id"),
	CONSTRAINT "package_session_ledger_reason" CHECK ("package_session_ledger"."reason" in ('attended', 'no_show', 'late_cancel', 'manual_adjustment')),
	CONSTRAINT "package_session_ledger_shape" CHECK ((
        "package_session_ledger"."reason" = 'manual_adjustment' and "package_session_ledger"."appointment_id" is null and "package_session_ledger"."reverses_id" is null
        and "package_session_ledger"."mark_no" is null and "package_session_ledger"."note" is not null and "package_session_ledger"."sessions_used" between -50 and 50
        and "package_session_ledger"."sessions_used" <> 0
      ) or (
        "package_session_ledger"."reason" <> 'manual_adjustment' and "package_session_ledger"."appointment_id" is not null and (
          ("package_session_ledger"."reverses_id" is null and "package_session_ledger"."mark_no" >= 1 and "package_session_ledger"."sessions_used" in (0, 1))
          or ("package_session_ledger"."reverses_id" is not null and "package_session_ledger"."mark_no" is null and "package_session_ledger"."sessions_used" in (0, -1))
        )
      )),
	CONSTRAINT "package_session_ledger_note_length" CHECK (char_length("package_session_ledger"."note") between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_preset_id_package_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."package_presets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_client_fk" FOREIGN KEY ("workspace_id","client_id") REFERENCES "public"."clients"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_package_fk" FOREIGN KEY ("workspace_id","package_id") REFERENCES "public"."client_packages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_payments" ADD CONSTRAINT "client_payments_voids_fk" FOREIGN KEY ("workspace_id","voids_id") REFERENCES "public"."client_payments"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_session_ledger" ADD CONSTRAINT "package_session_ledger_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_session_ledger" ADD CONSTRAINT "package_session_ledger_package_fk" FOREIGN KEY ("workspace_id","package_id") REFERENCES "public"."client_packages"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_session_ledger" ADD CONSTRAINT "package_session_ledger_appointment_fk" FOREIGN KEY ("workspace_id","appointment_id") REFERENCES "public"."appointments"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_session_ledger" ADD CONSTRAINT "package_session_ledger_reverses_fk" FOREIGN KEY ("workspace_id","reverses_id") REFERENCES "public"."package_session_ledger"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "client_packages_one_active_key" ON "client_packages" USING btree ("workspace_id","client_id") WHERE "client_packages"."status" = 'active';--> statement-breakpoint
CREATE INDEX "client_packages_workspace_client_created_at_idx" ON "client_packages" USING btree ("workspace_id","client_id","created_at");--> statement-breakpoint
CREATE INDEX "client_packages_preset_id_idx" ON "client_packages" USING btree ("preset_id");--> statement-breakpoint
CREATE INDEX "client_packages_created_by_user_id_idx" ON "client_packages" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "client_payments_workspace_package_created_at_idx" ON "client_payments" USING btree ("workspace_id","package_id","created_at");--> statement-breakpoint
CREATE INDEX "client_payments_recorded_by_user_id_idx" ON "client_payments" USING btree ("recorded_by_user_id");--> statement-breakpoint
CREATE INDEX "package_session_ledger_workspace_package_created_at_idx" ON "package_session_ledger" USING btree ("workspace_id","package_id","created_at");--> statement-breakpoint
CREATE INDEX "package_session_ledger_workspace_appointment_idx" ON "package_session_ledger" USING btree ("workspace_id","appointment_id");--> statement-breakpoint
CREATE INDEX "package_session_ledger_actor_user_id_idx" ON "package_session_ledger" USING btree ("actor_user_id");--> statement-breakpoint
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_type";--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_type" CHECK ("activity_events"."type" in ('lead_converted', 'client_onboarded', 'client_paused', 'client_resumed', 'client_archived', 'client_restored', 'package_sold', 'package_cancelled', 'payment_recorded', 'payment_voided', 'sessions_adjusted'));
