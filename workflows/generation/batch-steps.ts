import { and, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { generationAttempts, generationBatches, generationJobs, workflowOutbox } from "@/lib/db/schema";
import { dispatchBatchOutbox } from "@/lib/generation/batches";
import { releaseGeneration } from "@/lib/generation/accounting";

export async function maintainGenerationBatch(batchId: string, ownerId: string): Promise<Date | null> {
  "use step";
  const [batch] = await db.select({ status: generationBatches.status }).from(generationBatches)
    .where(and(eq(generationBatches.id, batchId), eq(generationBatches.ownerId, ownerId))).limit(1);
  if (!batch || ["partial", "succeeded", "failed"].includes(batch.status)) return null;

  await dispatchBatchOutbox(batchId, ownerId);
  const now = new Date();
  const stale = await db.select({ job: generationJobs, attempt: generationAttempts })
    .from(generationJobs).innerJoin(generationAttempts, eq(generationAttempts.jobId, generationJobs.id))
    .where(and(eq(generationJobs.batchId, batchId), eq(generationJobs.ownerId, ownerId),
      eq(generationJobs.status, "running"), lt(generationJobs.leaseExpiresAt, now),
      eq(generationAttempts.state, "started")));
  for (const { job, attempt } of stale) {
    // Expiry ends this attempt; it never sends another paid request. A user can
    // explicitly Regenerate a failed shot after the existing hold is released.
    await releaseGeneration({ jobId: job.id, attemptId: attempt.id,
      attemptState: "ambiguous",
      failureCode: "stalled_provider_call",
      publicError: "This shot could not be confirmed. Credits were released.",
      privateError: "Generation lease expired.",
      providerRequestId: attempt.providerRequestId ?? undefined,
      usageCostMicros: attempt.usageCostMicros ?? undefined });
  }
  const active = await db.select({ leaseExpiresAt: generationJobs.leaseExpiresAt }).from(generationJobs)
    .where(and(eq(generationJobs.batchId, batchId), eq(generationJobs.ownerId, ownerId),
      inArray(generationJobs.status, ["queued", "running"])));
  if (!active.length) return null;
  const pending = await db.select({ nextAttemptAt: workflowOutbox.nextAttemptAt, leaseExpiresAt: workflowOutbox.leaseExpiresAt })
    .from(workflowOutbox).innerJoin(generationJobs, eq(generationJobs.id, workflowOutbox.jobId))
    .where(and(eq(generationJobs.batchId, batchId), eq(workflowOutbox.ownerId, ownerId),
      or(eq(workflowOutbox.status, "pending"), eq(workflowOutbox.status, "dispatching"))));
  const deadlines = [now.getTime() + 10 * 60_000,
    ...active.map((job) => job.leaseExpiresAt && job.leaseExpiresAt > now ? job.leaseExpiresAt.getTime() : Infinity),
    ...pending.map((row) => (row.leaseExpiresAt ?? row.nextAttemptAt).getTime())];
  // Wake for dispatch retries and generation leases, with no browser heartbeat.
  return new Date(Math.max(now.getTime() + 1000, Math.min(...deadlines) + 100));
}
maintainGenerationBatch.maxRetries = 10;
