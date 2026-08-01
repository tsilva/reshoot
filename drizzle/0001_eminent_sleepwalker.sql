DROP INDEX "generation_outputs_job_unique";--> statement-breakpoint
ALTER TABLE "generation_outputs" ALTER COLUMN "job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_outputs" ALTER COLUMN "attempt_id" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_outputs_job_unique" ON "generation_outputs" USING btree ("job_id") WHERE "generation_outputs"."job_id" is not null;