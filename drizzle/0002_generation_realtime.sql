CREATE TABLE "generation_batch_revisions" (
	"batch_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_batch_revisions" ADD CONSTRAINT "generation_batch_revisions_batch_id_generation_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."generation_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_batch_revisions" ADD CONSTRAINT "generation_batch_revisions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO generation_batch_revisions (batch_id, owner_id)
SELECT id, owner_id FROM generation_batches;
--> statement-breakpoint
CREATE FUNCTION bump_generation_batch_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE changed_batch uuid; changed_owner uuid;
BEGIN
  IF TG_TABLE_NAME = 'generation_batches' THEN
    changed_batch := NEW.id; changed_owner := NEW.owner_id;
  ELSIF TG_TABLE_NAME = 'generation_jobs' THEN
    changed_batch := NEW.batch_id; changed_owner := NEW.owner_id;
  ELSE
    SELECT batch_id, owner_id INTO changed_batch, changed_owner
    FROM generation_jobs WHERE id = COALESCE(NEW.job_id, OLD.job_id);
  END IF;
  IF changed_batch IS NOT NULL THEN
    INSERT INTO generation_batch_revisions AS revisions (batch_id, owner_id, revision)
    VALUES (changed_batch, changed_owner, 1)
    ON CONFLICT (batch_id) DO UPDATE SET revision = revisions.revision + 1;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER generation_batch_revision AFTER INSERT OR UPDATE OF status, completed_jobs, failed_jobs
ON generation_batches FOR EACH ROW EXECUTE FUNCTION bump_generation_batch_revision();
--> statement-breakpoint
CREATE TRIGGER generation_job_revision AFTER INSERT OR UPDATE OF status, public_error
ON generation_jobs FOR EACH ROW EXECUTE FUNCTION bump_generation_batch_revision();
--> statement-breakpoint
CREATE TRIGGER generation_output_revision AFTER INSERT OR UPDATE OR DELETE
ON generation_outputs FOR EACH ROW EXECUTE FUNCTION bump_generation_batch_revision();
