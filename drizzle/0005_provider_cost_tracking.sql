CREATE TABLE "provider_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"generation_attempt_id" uuid,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"requested_model" text NOT NULL,
	"response_model" text,
	"upstream_provider" text,
	"request_id" text,
	"response_id" text,
	"state" text NOT NULL,
	"http_status" integer,
	"usage_cost_micros" bigint,
	"cost_source" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"cost_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_calls_purpose" CHECK ("provider_calls"."purpose" in ('image', 'project_naming')),
	CONSTRAINT "provider_calls_state" CHECK ("provider_calls"."state" in ('started', 'completed', 'http_error', 'transport_error', 'invalid_response', 'interrupted', 'legacy')),
	CONSTRAINT "provider_calls_cost_source" CHECK ("provider_calls"."cost_source" in ('response', 'generation_lookup', 'legacy')),
	CONSTRAINT "provider_calls_cost_range" CHECK ("provider_calls"."usage_cost_micros" between 0 and 9007199254740991),
	CONSTRAINT "provider_calls_cost_pair" CHECK (("provider_calls"."usage_cost_micros" is null) = ("provider_calls"."cost_source" is null)),
	CONSTRAINT "provider_calls_attempt_purpose" CHECK (("provider_calls"."purpose" = 'image') = ("provider_calls"."generation_attempt_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_generation_attempt_id_generation_attempts_id_fk" FOREIGN KEY ("generation_attempt_id") REFERENCES "public"."generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_calls_attempt_unique" ON "provider_calls" USING btree ("generation_attempt_id");--> statement-breakpoint
CREATE INDEX "provider_calls_project_started_idx" ON "provider_calls" USING btree ("project_id","started_at");
--> statement-breakpoint
-- Preserve historical image usage without changing outputs or credit records.
-- Older code could coerce null/invalid usage to zero, so historical zero costs
-- need provider reconciliation rather than being certified as free requests.
-- Automatic naming before this migration has no recoverable request ledger.
INSERT INTO "provider_calls" (
  "id", "owner_id", "project_id", "generation_attempt_id", "purpose",
  "provider", "endpoint", "requested_model", "request_id", "response_id",
  "state", "usage_cost_micros", "cost_source", "started_at", "finished_at",
  "created_at", "updated_at"
)
SELECT
  a.id, a.owner_id, b.project_id, a.id, 'image',
  CASE WHEN a.provider_endpoint LIKE 'https://openrouter.ai/%' THEN 'openrouter'
    WHEN a.provider_endpoint IS NOT NULL THEN 'agentbridge' ELSE 'unknown' END,
  coalesce(a.provider_endpoint, 'https://unrecorded.invalid/images'),
  coalesce(a.provider_model, 'unknown'), a.provider_request_id,
  CASE WHEN a.provider_request_id LIKE 'gen-%' THEN a.provider_request_id END,
  'legacy', CASE WHEN a.usage_cost_micros > 0 THEN a.usage_cost_micros END,
  CASE WHEN a.usage_cost_micros > 0 THEN 'legacy' END,
  coalesce(a.started_at, a.created_at),
  coalesce(a.succeeded_at, a.failed_at, a.ambiguous_at), a.created_at, now()
FROM generation_attempts a
JOIN generation_jobs j ON j.id = a.job_id
JOIN generation_batches b ON b.id = j.batch_id
WHERE a.started_at IS NOT NULL OR a.usage_cost_micros IS NOT NULL
ON CONFLICT DO NOTHING;
