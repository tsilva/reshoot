import { claimGenerationJob, executeGenerationJob } from "./steps";

export async function generationJobWorkflow(jobId: string) {
  "use workflow";
  console.info("Generation workflow started", { jobId });
  const claim = await claimGenerationJob(jobId);
  if (claim.kind !== "execute") {
    console.info("Generation workflow exited without paid work", {
      jobId,
      reason: claim.kind,
    });
    return { status: claim.kind };
  }
  const result = await executeGenerationJob(jobId, claim.attemptId, claim.leaseOwner);
  console.info("Generation workflow completed", { jobId, status: result.status });
  return result;
}
