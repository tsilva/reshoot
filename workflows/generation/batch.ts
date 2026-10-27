import { createHook, sleep } from "workflow";
import { maintainGenerationBatch } from "./batch-steps";

export async function generationBatchWorkflow(batchId: string, ownerId: string) {
  "use workflow";
  // Concurrent create/resume requests may start extra runs; only the token owner
  // performs maintenance. Registration completes before the first step executes.
  using hook = createHook({ token: `generation-batch:${batchId}` });
  const conflict = await hook.getConflict();
  if (conflict) return { dedupedTo: conflict.runId };
  for (;;) {
    const next = await maintainGenerationBatch(batchId, ownerId);
    if (!next) return { status: "terminal" };
    await sleep(next);
  }
}
