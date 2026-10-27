import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
import type { GenerationBatchStatus } from "@/lib/api/types";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import {
  generationBatches,
  generationJobs,
  generationOutputs,
} from "@/lib/db/schema";
import { signRead } from "@/lib/storage/r2";
import { outputDownloadUrl } from "@/lib/projects/downloads";

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
      and(eq(generationOutputs.ownerId, userId), eq(generationOutputs.projectId, batch.projectId),
        // Only return outputs belonging to this batch, rather than the project history.
        inArray(generationOutputs.jobId, jobs.map((job) => job.id))),
    );
  const outputByJob = new Map(outputs.map((output) => [output.jobId, output]));

  return {
    id: batch.id,
    projectId: batch.projectId,
    status: batch.status,
    totalCredits: batch.totalCredits,
    completedJobs: batch.completedJobs,
    failedJobs: batch.failedJobs,
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
                mimeType: output.mimeType,
                previewUrl: await signRead(output.previewR2Key),
                downloadUrl: outputDownloadUrl(batch.projectId, output.id),
                approvedAt: output.approvedAt?.toISOString() ?? null,
                selectedAt: output.selectedAt?.toISOString() ?? null,
                createdAt: output.createdAt.toISOString(),
              }
            : null,
        };
      }),
    ),
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
  };
}
