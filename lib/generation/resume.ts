import "server-only";
import { and, eq } from "drizzle-orm";
import { start } from "workflow/api";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { generationBatches } from "@/lib/db/schema";
import { generationBatchWorkflow } from "@/workflows/generation/batch";

export async function resumeGenerationBatch(ownerId: string, batchId: string) {
  const [batch] = await db.select({ status: generationBatches.status }).from(generationBatches)
    .where(and(eq(generationBatches.id, batchId), eq(generationBatches.ownerId, ownerId))).limit(1);
  if (!batch) throw new ApiError(404, "batch_not_found", "Batch not found.");
  if (!["partial", "succeeded", "failed"].includes(batch.status)) {
    await start(generationBatchWorkflow, [batchId, ownerId]);
  }
}
