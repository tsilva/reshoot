import "server-only";

import { and, asc, eq, lt } from "drizzle-orm";
import type { GenerationBatchStatus } from "@/lib/api/types";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import {
  generationAttempts,
  generationBatches,
  generationJobs,
  generationOutputs,
} from "@/lib/db/schema";
import { dispatchBatchOutbox } from "@/lib/generation/batches";
import { releaseGeneration } from "@/lib/generation/accounting";
import { signRead } from "@/lib/storage/r2";

export async function getGenerationBatchStatus(
  userId: string,
  batchId: string,
): Promise<GenerationBatchStatus> {
  const [batch] = await db
    .select()
    .from(generationBatches)
    .where(
      and(
        eq(generationBatches.id, batchId),
        eq(generationBatches.ownerId, userId),
      ),
    )
    .limit(1);
  if (!batch) throw new ApiError(404, "batch_not_found", "Batch not found.");

  await dispatchBatchOutbox(batch.id, userId);

  const stale = await db
    .select({ job: generationJobs, attempt: generationAttempts })
    .from(generationJobs)
    .innerJoin(generationAttempts, eq(generationAttempts.jobId, generationJobs.id))
    .where(
      and(
        eq(generationJobs.batchId, batch.id),
        eq(generationJobs.ownerId, userId),
        eq(generationJobs.status, "running"),
        lt(generationJobs.leaseExpiresAt, new Date()),
        eq(generationAttempts.state, "started"),
      ),
    );
  for (const row of stale) {
    await releaseGeneration({
      jobId: row.job.id,
      attemptId: row.attempt.id,
      attemptState: "ambiguous",
      failureCode: "stalled_provider_call",
      publicError: "This shot could not be confirmed. Credits were released.",
      privateError: "Generation lease expired after the paid call started.",
      providerRequestId: row.attempt.providerRequestId ?? undefined,
      usageCostMicros: row.attempt.usageCostMicros ?? undefined,
    });
  }

  const jobs = await db
    .select()
    .from(generationJobs)
    .where(
      and(eq(generationJobs.batchId, batch.id), eq(generationJobs.ownerId, userId)),
    )
    .orderBy(asc(generationJobs.createdAt));
  const outputs = await db
    .select()
    .from(generationOutputs)
    .where(
      and(eq(generationOutputs.ownerId, userId), eq(generationOutputs.projectId, batch.projectId)),
    );
  const outputByJob = new Map(outputs.map((output) => [output.jobId, output]));
  const refreshed = stale.length
    ? (
        await db
          .select()
          .from(generationBatches)
          .where(eq(generationBatches.id, batch.id))
          .limit(1)
      )[0] ?? batch
    : batch;

  return {
    id: refreshed.id,
    projectId: refreshed.projectId,
    status: refreshed.status,
    totalCredits: refreshed.totalCredits,
    completedJobs: refreshed.completedJobs,
    failedJobs: refreshed.failedJobs,
    jobs: await Promise.all(
      jobs.map(async (job) => {
        const output = outputByJob.get(job.id);
        return {
          id: job.id,
          shotId: job.shotId,
          status: job.status,
          version: job.version,
          quotedCredits: job.quotedCredits,
          publicError: job.publicError,
          output: output
            ? {
                outputId: output.id,
                version: output.version,
                previewUrl: await signRead(output.previewR2Key),
                downloadUrl: await signRead(output.r2Key),
                approvedAt: output.approvedAt?.toISOString() ?? null,
                selectedAt: output.selectedAt?.toISOString() ?? null,
                createdAt: output.createdAt.toISOString(),
              }
            : null,
        };
      }),
    ),
    createdAt: refreshed.createdAt.toISOString(),
    updatedAt: refreshed.updatedAt.toISOString(),
  };
}
