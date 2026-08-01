import "server-only";

import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  creditAccounts,
  creditHolds,
  creditLedger,
  generationAttempts,
  generationBatches,
  generationJobs,
  generationOutputs,
  projects,
} from "@/lib/db/schema";

async function updateBatchCompletion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  batchId: string,
) {
  const [succeeded, failed, total] = await Promise.all([
    tx
      .select({ value: count() })
      .from(generationJobs)
      .where(
        and(eq(generationJobs.batchId, batchId), eq(generationJobs.status, "succeeded")),
      ),
    tx
      .select({ value: count() })
      .from(generationJobs)
      .where(
        and(eq(generationJobs.batchId, batchId), eq(generationJobs.status, "failed")),
      ),
    tx
      .select({ value: count() })
      .from(generationJobs)
      .where(eq(generationJobs.batchId, batchId)),
  ]);
  const completedJobs = succeeded[0]?.value ?? 0;
  const failedJobs = failed[0]?.value ?? 0;
  const totalJobs = total[0]?.value ?? 0;
  const complete = completedJobs + failedJobs === totalJobs;
  const status = !complete
    ? "running"
    : completedJobs && failedJobs
      ? "partial"
      : failedJobs
        ? "failed"
        : "succeeded";
  await tx
    .update(generationBatches)
    .set({
      completedJobs,
      failedJobs,
      status,
      completedAt: complete ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(generationBatches.id, batchId));

  if (complete) {
    const [batch] = await tx
      .select({ projectId: generationBatches.projectId, ownerId: generationBatches.ownerId })
      .from(generationBatches)
      .where(eq(generationBatches.id, batchId))
      .limit(1);
    if (batch) {
      await tx
        .update(projects)
        .set({ status: "ready", updatedAt: new Date() })
        .where(
          and(eq(projects.id, batch.projectId), eq(projects.ownerId, batch.ownerId)),
        );
    }
  }
}

export async function captureGeneration(input: {
  jobId: string;
  attemptId: string;
  output: {
    projectId: string;
    ownerId: string;
    shotId: string;
    version: number;
    r2Key: string;
    previewR2Key: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
    width: number;
    height: number;
  };
  providerRequestId?: string;
  usageCostMicros?: number;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${generationJobs} where ${generationJobs.id} = ${input.jobId}::uuid for update`,
    );
    const [job] = await tx
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, input.jobId))
      .limit(1);
    if (!job) throw new Error("Generation job is missing.");
    const [existing] = await tx
      .select({ id: generationOutputs.id })
      .from(generationOutputs)
      .where(eq(generationOutputs.jobId, job.id))
      .limit(1);
    if (existing) return existing.id;

    const [hold] = await tx
      .select()
      .from(creditHolds)
      .where(eq(creditHolds.batchId, job.batchId))
      .limit(1);
    if (!hold || hold.remainingCredits < job.quotedCredits) {
      throw new Error("Generation credit hold is inconsistent.");
    }
    await tx.execute(
      sql`select id from ${creditAccounts} where ${creditAccounts.id} = ${hold.accountId}::uuid for update`,
    );
    const [account] = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.id, hold.accountId))
      .limit(1);
    if (!account || account.heldCredits < job.quotedCredits) {
      throw new Error("Held credit balance is inconsistent.");
    }

    const [output] = await tx
      .insert(generationOutputs)
      .values({
        ...input.output,
        jobId: job.id,
        attemptId: input.attemptId,
      })
      .returning({ id: generationOutputs.id });
    await tx
      .update(generationAttempts)
      .set({
        state: "succeeded",
        providerRequestId: input.providerRequestId,
        usageCostMicros: input.usageCostMicros,
        succeededAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(generationAttempts.id, input.attemptId));
    await tx
      .update(generationJobs)
      .set({
        status: "succeeded",
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        publicError: null,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, job.id));

    const remainingCredits = hold.remainingCredits - job.quotedCredits;
    const capturedCredits = hold.capturedCredits + job.quotedCredits;
    const holdStatus = remainingCredits
      ? "partial"
      : hold.releasedCredits
        ? "partial"
        : "captured";
    await tx
      .update(creditHolds)
      .set({
        remainingCredits,
        capturedCredits,
        status: holdStatus,
        completedAt: remainingCredits ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creditHolds.id, hold.id));
    const heldAfter = account.heldCredits - job.quotedCredits;
    await tx
      .update(creditAccounts)
      .set({ heldCredits: heldAfter, updatedAt: new Date() })
      .where(eq(creditAccounts.id, account.id));
    await tx
      .insert(creditLedger)
      .values({
        accountId: account.id,
        userId: job.ownerId,
        type: "capture",
        sourceType: "generation_job",
        sourceId: job.id,
        amountCredits: job.quotedCredits,
        availableDelta: 0,
        heldDelta: -job.quotedCredits,
        availableAfter: account.availableCredits,
        heldAfter,
        description: "Generated shot completed",
      })
      .onConflictDoNothing();
    await updateBatchCompletion(tx, job.batchId);
    return output.id;
  });
}

export async function releaseGeneration(input: {
  jobId: string;
  attemptId: string;
  attemptState: "failed" | "ambiguous";
  failureCode: string;
  publicError: string;
  privateError: string;
  providerRequestId?: string;
  usageCostMicros?: number;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${generationJobs} where ${generationJobs.id} = ${input.jobId}::uuid for update`,
    );
    const [job] = await tx
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, input.jobId))
      .limit(1);
    if (!job || job.status === "failed" || job.status === "succeeded") return;
    const [hold] = await tx
      .select()
      .from(creditHolds)
      .where(eq(creditHolds.batchId, job.batchId))
      .limit(1);
    if (!hold) throw new Error("Generation credit hold is missing.");
    await tx.execute(
      sql`select id from ${creditAccounts} where ${creditAccounts.id} = ${hold.accountId}::uuid for update`,
    );
    const [account] = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.id, hold.accountId))
      .limit(1);
    if (!account) throw new Error("Credit account is missing.");

    await tx
      .update(generationAttempts)
      .set({
        state: input.attemptState,
        providerRequestId: input.providerRequestId,
        usageCostMicros: input.usageCostMicros,
        privateError: input.privateError.slice(0, 4000),
        ...(input.attemptState === "failed"
          ? { failedAt: new Date() }
          : { ambiguousAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(generationAttempts.id, input.attemptId));
    await tx
      .update(generationJobs)
      .set({
        status: "failed",
        failureCode: input.failureCode,
        publicError: input.publicError,
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(generationJobs.id, job.id));

    const remainingCredits = Math.max(0, hold.remainingCredits - job.quotedCredits);
    const releasedCredits = hold.releasedCredits + job.quotedCredits;
    const holdStatus = remainingCredits
      ? "partial"
      : hold.capturedCredits
        ? "partial"
        : "released";
    await tx
      .update(creditHolds)
      .set({
        remainingCredits,
        releasedCredits,
        status: holdStatus,
        completedAt: remainingCredits ? null : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(creditHolds.id, hold.id));
    const availableAfter = account.availableCredits + job.quotedCredits;
    const heldAfter = Math.max(0, account.heldCredits - job.quotedCredits);
    await tx
      .update(creditAccounts)
      .set({
        availableCredits: availableAfter,
        heldCredits: heldAfter,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, account.id));
    await tx
      .insert(creditLedger)
      .values({
        accountId: account.id,
        userId: job.ownerId,
        type: "release",
        sourceType: "generation_job",
        sourceId: job.id,
        amountCredits: job.quotedCredits,
        availableDelta: job.quotedCredits,
        heldDelta: -job.quotedCredits,
        availableAfter,
        heldAfter,
        description: "Generation failed — credits released",
      })
      .onConflictDoNothing();
    await updateBatchCompletion(tx, job.batchId);
  });
}
