CREATE TYPE "public"."asset_kind" AS ENUM('original', 'generated');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('pending', 'uploaded', 'processing', 'ready', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."asset_variant_kind" AS ENUM('preview', 'generation_reference');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('claimed', 'started', 'succeeded', 'failed', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('held', 'queued', 'running', 'partial', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."credit_hold_status" AS ENUM('held', 'partial', 'captured', 'released');--> statement-breakpoint
CREATE TYPE "public"."credit_ledger_type" AS ENUM('grant', 'hold', 'capture', 'release', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'dispatching', 'dispatched', 'reconcile', 'failed');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('draft', 'ready', 'generating', 'archived', 'deleted');--> statement-breakpoint
CREATE TABLE "asset_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "asset_variant_kind" NOT NULL,
	"r2_key" text NOT NULL,
	"mime_type" text DEFAULT 'image/webp' NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "asset_kind" DEFAULT 'original' NOT NULL,
	"status" "asset_status" DEFAULT 'pending' NOT NULL,
	"original_filename" text NOT NULL,
	"r2_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"width" integer,
	"height" integer,
	"upload_expires_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone,
	"failure_code" text,
	"deleted_at" timestamp with time zone,
	"retained_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_size_nonnegative" CHECK ("assets"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"available_credits" integer DEFAULT 0 NOT NULL,
	"held_credits" integer DEFAULT 0 NOT NULL,
	"lifetime_granted_credits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_accounts_available_nonnegative" CHECK ("credit_accounts"."available_credits" >= 0),
	CONSTRAINT "credit_accounts_held_nonnegative" CHECK ("credit_accounts"."held_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"status" "credit_hold_status" DEFAULT 'held' NOT NULL,
	"original_credits" integer NOT NULL,
	"remaining_credits" integer NOT NULL,
	"captured_credits" integer DEFAULT 0 NOT NULL,
	"released_credits" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_holds_original_positive" CHECK ("credit_holds"."original_credits" > 0),
	CONSTRAINT "credit_holds_remaining_nonnegative" CHECK ("credit_holds"."remaining_credits" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "credit_ledger_type" NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"amount_credits" integer NOT NULL,
	"available_delta" integer NOT NULL,
	"held_delta" integer NOT NULL,
	"available_after" integer NOT NULL,
	"held_after" integer NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_amount_positive" CHECK ("credit_ledger"."amount_credits" > 0),
	CONSTRAINT "credit_ledger_balances_nonnegative" CHECK ("credit_ledger"."available_after" >= 0 and "credit_ledger"."held_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"credits" integer NOT NULL,
	"usd_micros" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_packs_credits_positive" CHECK ("credit_packs"."credits" > 0),
	CONSTRAINT "credit_packs_usd_positive" CHECK ("credit_packs"."usd_micros" > 0)
);
--> statement-breakpoint
CREATE TABLE "generation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_number" integer NOT NULL,
	"state" "attempt_status" DEFAULT 'claimed' NOT NULL,
	"provider_request_id" text,
	"provider_model" text,
	"provider_endpoint" text,
	"usage_cost_micros" integer,
	"output_r2_key" text NOT NULL,
	"preview_r2_key" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"succeeded_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"ambiguous_at" timestamp with time zone,
	"private_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "batch_status" DEFAULT 'held' NOT NULL,
	"total_credits" integer NOT NULL,
	"completed_jobs" integer DEFAULT 0 NOT NULL,
	"failed_jobs" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"role" text NOT NULL,
	"frozen_r2_key" text NOT NULL,
	"frozen_checksum_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"shot_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"version" integer NOT NULL,
	"reference_count" integer NOT NULL,
	"quoted_credits" integer NOT NULL,
	"workflow_run_id" text,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failure_code" text,
	"public_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_jobs_reference_range" CHECK ("generation_jobs"."reference_count" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "generation_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"attempt_id" uuid NOT NULL,
	"shot_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"r2_key" text NOT NULL,
	"preview_r2_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"approved_at" timestamp with time zone,
	"selected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"price_version_id" uuid NOT NULL,
	"shots" jsonb NOT NULL,
	"total_credits" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_quotes_total_positive" CHECK ("generation_quotes"."total_credits" > 0)
);
--> statement-breakpoint
CREATE TABLE "price_bands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_version_id" uuid NOT NULL,
	"reference_count" integer NOT NULL,
	"credits_per_shot" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_bands_reference_range" CHECK ("price_bands"."reference_count" between 1 and 5),
	CONSTRAINT "price_bands_credits_positive" CHECK ("price_bands"."credits_per_shot" > 0)
);
--> statement-breakpoint
CREATE TABLE "price_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"output_cost_micros" integer NOT NULL,
	"text_allowance_micros" integer NOT NULL,
	"reference_allowance_micros" integer NOT NULL,
	"provider_funding_bps" integer NOT NULL,
	"failure_reserve_bps" integer NOT NULL,
	"gross_margin_bps" integer NOT NULL,
	"credits_per_usd" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "project_status" DEFAULT 'draft' NOT NULL,
	"primary_asset_id" uuid,
	"deleted_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_title_not_blank" CHECK (length(trim("projects"."title")) > 0)
);
--> statement-breakpoint
CREATE TABLE "shots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"preset_key" text,
	"prompt" text,
	"azimuth" integer,
	"elevation" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"credits" integer NOT NULL,
	"usd_micros" integer NOT NULL,
	"ledger_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"legacy_import_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"workflow_run_id" text,
	"lease_owner" text,
	"lease_expires_at" timestamp with time zone,
	"dispatch_attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_account_id_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_batch_id_generation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."generation_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_account_id_credit_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_batches" ADD CONSTRAINT "generation_batches_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_batches" ADD CONSTRAINT "generation_batches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_batches" ADD CONSTRAINT "generation_batches_quote_id_generation_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."generation_quotes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_inputs" ADD CONSTRAINT "generation_inputs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_inputs" ADD CONSTRAINT "generation_inputs_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_inputs" ADD CONSTRAINT "generation_inputs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_batch_id_generation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."generation_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_attempt_id_generation_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_outputs" ADD CONSTRAINT "generation_outputs_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_quotes" ADD CONSTRAINT "generation_quotes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_quotes" ADD CONSTRAINT "generation_quotes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_quotes" ADD CONSTRAINT "generation_quotes_price_version_id_price_versions_id_fk" FOREIGN KEY ("price_version_id") REFERENCES "public"."price_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_bands" ADD CONSTRAINT "price_bands_price_version_id_price_versions_id_fk" FOREIGN KEY ("price_version_id") REFERENCES "public"."price_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_purchases" ADD CONSTRAINT "test_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_purchases" ADD CONSTRAINT "test_purchases_pack_id_credit_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."credit_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_outbox" ADD CONSTRAINT "workflow_outbox_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_outbox" ADD CONSTRAINT "workflow_outbox_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_variants_asset_kind_unique" ON "asset_variants" USING btree ("asset_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_variants_r2_key_unique" ON "asset_variants" USING btree ("r2_key");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_r2_key_unique" ON "assets" USING btree ("r2_key");--> statement-breakpoint
CREATE INDEX "assets_project_status_idx" ON "assets" USING btree ("project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_accounts_user_unique" ON "credit_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_holds_batch_unique" ON "credit_holds" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_source_unique" ON "credit_ledger" USING btree ("user_id","type","source_type","source_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_user_created_idx" ON "credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_packs_slug_unique" ON "credit_packs" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_attempts_job_number_unique" ON "generation_attempts" USING btree ("job_id","attempt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_attempts_output_key_unique" ON "generation_attempts" USING btree ("output_r2_key");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_batches_owner_idempotency_unique" ON "generation_batches" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_batches_quote_unique" ON "generation_batches" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "generation_batches_project_created_idx" ON "generation_batches" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_inputs_job_ordinal_unique" ON "generation_inputs" USING btree ("job_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_shot_version_unique" ON "generation_jobs" USING btree ("shot_id","version");--> statement-breakpoint
CREATE INDEX "generation_jobs_owner_status_idx" ON "generation_jobs" USING btree ("owner_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_outputs_job_unique" ON "generation_outputs" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_outputs_r2_key_unique" ON "generation_outputs" USING btree ("r2_key");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_outputs_shot_version_unique" ON "generation_outputs" USING btree ("shot_id","version");--> statement-breakpoint
CREATE INDEX "generation_quotes_owner_expiry_idx" ON "generation_quotes" USING btree ("owner_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "price_bands_version_references_unique" ON "price_bands" USING btree ("price_version_id","reference_count");--> statement-breakpoint
CREATE UNIQUE INDEX "price_versions_label_unique" ON "price_versions" USING btree ("label");--> statement-breakpoint
CREATE INDEX "projects_owner_updated_idx" ON "projects" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "shots_project_created_idx" ON "shots" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "test_purchases_user_idempotency_unique" ON "test_purchases" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_outbox_job_unique" ON "workflow_outbox" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "workflow_outbox_dispatch_idx" ON "workflow_outbox" USING btree ("status","next_attempt_at");
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_primary_asset_id_assets_id_fk" FOREIGN KEY ("primary_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "generation_quotes" ADD CONSTRAINT "generation_quotes_used_batch_id_generation_batches_id_fk" FOREIGN KEY ("used_batch_id") REFERENCES "public"."generation_batches"("id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "test_purchases" ADD CONSTRAINT "test_purchases_ledger_entry_id_credit_ledger_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."credit_ledger"("id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;
--> statement-breakpoint
ALTER TABLE "credit_holds" ADD CONSTRAINT "credit_holds_accounting_consistent" CHECK ("remaining_credits" + "captured_credits" + "released_credits" = "original_credits");
--> statement-breakpoint
CREATE UNIQUE INDEX "price_versions_one_active_unique" ON "price_versions" ((active)) WHERE active = true;
--> statement-breakpoint
INSERT INTO "users" ("id", "email", "display_name", "is_demo") VALUES
  ('00000000-0000-4000-8000-000000000001', 'demo@reshoot.local', 'Reshoot Demo', true)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "credit_accounts" ("id", "user_id", "available_credits", "held_credits", "lifetime_granted_credits") VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 0, 0, 0)
ON CONFLICT ("user_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "credit_packs" ("id", "slug", "name", "credits", "usd_micros", "sort_order") VALUES
  ('00000000-0000-4000-8000-000000000301', 'starter', 'Starter', 1000, 10000000, 1),
  ('00000000-0000-4000-8000-000000000302', 'studio', 'Studio', 2500, 25000000, 2),
  ('00000000-0000-4000-8000-000000000303', 'pro', 'Pro', 5000, 50000000, 3)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "price_versions" (
  "id", "label", "output_cost_micros", "text_allowance_micros",
  "reference_allowance_micros", "provider_funding_bps",
  "failure_reserve_bps", "gross_margin_bps", "credits_per_usd",
  "active", "activated_at"
) VALUES (
  '00000000-0000-4000-8000-000000000201', '2026-08-initial', 211000, 5000,
  52000, 10550, 10500, 2000, 100, true, now()
)
ON CONFLICT ("label") DO NOTHING;
--> statement-breakpoint
INSERT INTO "price_bands" ("price_version_id", "reference_count", "credits_per_shot") VALUES
  ('00000000-0000-4000-8000-000000000201', 1, 40),
  ('00000000-0000-4000-8000-000000000201', 2, 45),
  ('00000000-0000-4000-8000-000000000201', 3, 55),
  ('00000000-0000-4000-8000-000000000201', 4, 60),
  ('00000000-0000-4000-8000-000000000201', 5, 70)
ON CONFLICT ("price_version_id", "reference_count") DO NOTHING;
