import { createHook, sleep } from "workflow";
import { maintainGenerationBatch } from "./batch-steps";
import { prepareGenerationArchive } from "./archive-step";

export async function generationBatchWorkflow(batchId: string, ownerId: string) {
  "use workflow";
  // Concurrent create/resume requests may start extra runs; only the token owner
  // performs maintenance. Registration completes before the first step executes.
  using hook = createHook({ token: `generation-batch:${batchId}` });
  const conflict = await hook.getConflict();
  if (conflict) return { dedupedTo: conflict.runId };
  for (;;) {
    const next = await maintainGenerationBatch(batchId, ownerId);
    if (!next) break;
    await sleep(next);
  }
  // A lease expiry can settle the last job without its job workflow returning.
  await prepareGenerationArchive({ batchId });
  return { status: "terminal" };
}
