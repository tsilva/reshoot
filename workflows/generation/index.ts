import { claimGenerationJob, executeGenerationJob } from "./steps";
import { prepareGenerationArchive } from "./archive-step";
import { sleep } from "workflow";

export async function generationJobWorkflow(jobId: string) {
  "use workflow";
  console.info("Generation workflow started", { jobId });
  let claim = await claimGenerationJob(jobId);
  while (claim.kind === "waiting") {
    // Waiting for predecessors is normal orchestration, not a failed attempt
    // or a provider retry. Durable sleep survives page closes and long shoots.
    await sleep("10s");
    claim = await claimGenerationJob(jobId);
  }
  if (claim.kind !== "execute") {
    console.info("Generation workflow exited without paid work", {
      jobId,
      reason: claim.kind,
    });
    return { status: claim.kind };
  }
  const result = await executeGenerationJob(jobId, claim.attemptId, claim.leaseOwner);
  await prepareGenerationArchive({ jobId });
  console.info("Generation workflow completed", { jobId, status: result.status });
  return result;
}
