ALTER TABLE "provider_calls" DROP CONSTRAINT "provider_calls_purpose";--> statement-breakpoint
ALTER TABLE "provider_calls" DROP CONSTRAINT "provider_calls_attempt_purpose";--> statement-breakpoint
DROP INDEX "provider_calls_attempt_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "provider_calls_attempt_purpose_unique" ON "provider_calls" USING btree ("generation_attempt_id","purpose");--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_purpose" CHECK ("provider_calls"."purpose" in ('image', 'project_naming', 'rotation_review'));--> statement-breakpoint
ALTER TABLE "provider_calls" ADD CONSTRAINT "provider_calls_attempt_purpose" CHECK (("provider_calls"."purpose" in ('image', 'rotation_review')) = ("provider_calls"."generation_attempt_id" is not null));