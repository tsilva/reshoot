import "server-only";

import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  max,
  or,
  sql,
} from "drizzle-orm";
import { start } from "workflow/api";
import { ApiError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import {
  assets,
  assetVariants,
  creditAccounts,
  creditHolds,
  creditLedger,
  generationBatches,
  generationInputs,
  generationJobs,
  generationQuotes,
  priceBands,
  projects,
  shots,
  workflowOutbox,
} from "@/lib/db/schema";
import { generationJobWorkflow } from "@/workflows/generation";

export async function createGenerationBatch(input: {
  userId: string;
  projectId: string;
  quoteId: string;
  idempotencyKey: string;
}) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${generationQuotes} where ${generationQuotes.id} = ${input.quoteId}::uuid for update`,
    );
    const [existing] = await tx
      .select()
      .from(generationBatches)
      .where(
        and(
          eq(generationBatches.ownerId, input.userId),
          eq(generationBatches.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return existing;

    const [quote] = await tx
      .select()
      .from(generationQuotes)
      .where(
        and(
          eq(generationQuotes.id, input.quoteId),
          eq(generationQuotes.ownerId, input.userId),
          eq(generationQuotes.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (!quote) throw new ApiError(404, "quote_not_found", "Quote not found.");
    if (quote.usedAt || quote.usedBatchId) {
      throw new ApiError(409, "quote_used", "This quote has already been used.");
    }
    if (quote.expiresAt <= new Date()) {
      throw new ApiError(410, "quote_expired", "This quote has expired. Review a new quote.");
    }

    await tx.execute(
      sql`select id from ${creditAccounts} where ${creditAccounts.userId} = ${input.userId}::uuid for update`,
    );
    const [account] = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, input.userId))
      .limit(1);
    if (!account) throw new Error("Credit account is missing.");
    if (account.availableCredits < quote.totalCredits) {
      throw new ApiError(
        409,
        "insufficient_credits",
        `You need ${quote.totalCredits} credits for this batch.`,
      );
    }

    const bands = await tx
      .select()
      .from(priceBands)
      .where(eq(priceBands.priceVersionId, quote.priceVersionId));
    const creditsByCount = new Map(
      bands.map((band) => [band.referenceCount, band.creditsPerShot]),
    );
    const [batch] = await tx
      .insert(generationBatches)
      .values({
        ownerId: input.userId,
        projectId: input.projectId,
        quoteId: quote.id,
        idempotencyKey: input.idempotencyKey,
        totalCredits: quote.totalCredits,
        status: "queued",
      })
      .returning();

    let recalculatedTotal = 0;
    for (const requested of quote.shots) {
      let shotId = requested.shotId;
      if (shotId) {
        const [ownedShot] = await tx
          .select({ id: shots.id })
          .from(shots)
          .where(
            and(
              eq(shots.id, shotId),
              eq(shots.ownerId, input.userId),
              eq(shots.projectId, input.projectId),
            ),
          )
          .limit(1);
        if (!ownedShot) throw new ApiError(400, "invalid_shot", "Shot not found.");
      } else {
        const [createdShot] = await tx
          .insert(shots)
          .values({
            ownerId: input.userId,
            projectId: input.projectId,
            label: requested.label,
            presetKey: requested.presetKey,
            prompt: requested.prompt,
            azimuth: requested.azimuth,
            elevation: requested.elevation,
          })
          .returning({ id: shots.id });
        shotId = createdShot.id;
      }

      const [versionRow] = await tx
        .select({ value: max(generationJobs.version) })
        .from(generationJobs)
        .where(eq(generationJobs.shotId, shotId));
      const version = (versionRow?.value ?? 0) + 1;
      const quotedCredits = creditsByCount.get(requested.referenceAssetIds.length);
      if (!quotedCredits) throw new Error("Pricing band is missing.");
      recalculatedTotal += quotedCredits;

      const referenceRows = await tx
        .select({
          assetId: assets.id,
          key: assetVariants.r2Key,
          checksum: assetVariants.checksumSha256,
        })
        .from(assets)
        .innerJoin(assetVariants, eq(assetVariants.assetId, assets.id))
        .where(
          and(
            inArray(assets.id, requested.referenceAssetIds),
            eq(assets.ownerId, input.userId),
            eq(assets.projectId, input.projectId),
            eq(assets.status, "ready"),
            eq(assetVariants.ownerId, input.userId),
            eq(assetVariants.kind, "generation_reference"),
          ),
        );
      if (referenceRows.length !== requested.referenceAssetIds.length) {
        throw new ApiError(
          409,
          "reference_unavailable",
          "One of the quoted reference photos is no longer available.",
        );
      }
      const referencesById = new Map(referenceRows.map((row) => [row.assetId, row]));
      const jobId = crypto.randomUUID();
      await tx.insert(generationJobs).values({
        id: jobId,
        ownerId: input.userId,
        batchId: batch.id,
        shotId,
        version,
        referenceCount: requested.referenceAssetIds.length,
        quotedCredits,
      });
      await tx.insert(generationInputs).values(
        requested.referenceAssetIds.map((assetId, ordinal) => {
          const reference = referencesById.get(assetId)!;
          return {
            ownerId: input.userId,
            jobId,
            assetId,
            ordinal,
            role: ordinal === 0 ? "primary" : "additional",
            frozenR2Key: reference.key,
            frozenChecksumSha256: reference.checksum,
          };
        }),
      );
      await tx.insert(workflowOutbox).values({
        ownerId: input.userId,
        jobId,
      });
    }
    if (recalculatedTotal !== quote.totalCredits) {
      throw new Error("The frozen quote total is inconsistent.");
    }

    const availableAfter = account.availableCredits - quote.totalCredits;
    const heldAfter = account.heldCredits + quote.totalCredits;
    await tx
      .update(creditAccounts)
      .set({
        availableCredits: availableAfter,
        heldCredits: heldAfter,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.id, account.id));
    await tx.insert(creditHolds).values({
      accountId: account.id,
      userId: input.userId,
      batchId: batch.id,
      originalCredits: quote.totalCredits,
      remainingCredits: quote.totalCredits,
    });
    await tx.insert(creditLedger).values({
      accountId: account.id,
      userId: input.userId,
      type: "hold",
      sourceType: "generation_batch",
      sourceId: batch.id,
      amountCredits: quote.totalCredits,
      availableDelta: -quote.totalCredits,
      heldDelta: quote.totalCredits,
      availableAfter,
      heldAfter,
      description: `Generation batch — ${quote.shots.length} shot${quote.shots.length === 1 ? "" : "s"}`,
    });
    await tx
      .update(generationQuotes)
      .set({ usedAt: new Date(), usedBatchId: batch.id, updatedAt: new Date() })
      .where(eq(generationQuotes.id, quote.id));
    await tx
      .update(projects)
      .set({ status: "generating", updatedAt: new Date() })
      .where(
        and(eq(projects.id, input.projectId), eq(projects.ownerId, input.userId)),
      );
    return batch;
  });
}

export async function dispatchBatchOutbox(batchId: string, userId: string) {
  const jobRows = await db
    .select({ outbox: workflowOutbox, job: generationJobs })
    .from(workflowOutbox)
    .innerJoin(generationJobs, eq(generationJobs.id, workflowOutbox.jobId))
    .where(
      and(
        eq(generationJobs.batchId, batchId),
        eq(generationJobs.ownerId, userId),
        eq(workflowOutbox.ownerId, userId),
        or(
          eq(workflowOutbox.status, "pending"),
          and(
            eq(workflowOutbox.status, "dispatching"),
            or(
              isNull(workflowOutbox.leaseExpiresAt),
              lt(workflowOutbox.leaseExpiresAt, new Date()),
            ),
          ),
        ),
      ),
    )
    .orderBy(desc(workflowOutbox.createdAt));

  for (const row of jobRows) {
    const leaseOwner = crypto.randomUUID();
    const [claimed] = await db
      .update(workflowOutbox)
      .set({
        status: "dispatching",
        leaseOwner,
        leaseExpiresAt: new Date(Date.now() + 60_000),
        dispatchAttempts: row.outbox.dispatchAttempts + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(workflowOutbox.id, row.outbox.id),
          eq(workflowOutbox.ownerId, userId),
          or(
            eq(workflowOutbox.status, "pending"),
            lt(workflowOutbox.leaseExpiresAt, new Date()),
          ),
        ),
      )
      .returning({ id: workflowOutbox.id });
    if (!claimed) continue;
    try {
      const run = await start(generationJobWorkflow, [row.job.id]);
      await db.transaction(async (tx) => {
        await tx
          .update(workflowOutbox)
          .set({
            status: "dispatched",
            workflowRunId: run.runId,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workflowOutbox.id, row.outbox.id),
              eq(workflowOutbox.leaseOwner, leaseOwner),
            ),
          );
        await tx
          .update(generationJobs)
          .set({ workflowRunId: run.runId, updatedAt: new Date() })
          .where(and(eq(generationJobs.id, row.job.id), eq(generationJobs.ownerId, userId)));
      });
    } catch (error) {
      await db
        .update(workflowOutbox)
        .set({
          status: "pending",
          leaseOwner: null,
          leaseExpiresAt: null,
          nextAttemptAt: new Date(Date.now() + 10_000),
          lastError: error instanceof Error ? error.message.slice(0, 2000) : "Dispatch failed",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowOutbox.id, row.outbox.id),
            eq(workflowOutbox.leaseOwner, leaseOwner),
          ),
        );
    }
  }
}

export async function reconcileGenerationOutbox(limit = 100) {
  const now = new Date();
  const rows = await db
    .select({
      outboxId: workflowOutbox.id,
      batchId: generationJobs.batchId,
      ownerId: generationJobs.ownerId,
    })
    .from(workflowOutbox)
    .innerJoin(generationJobs, eq(generationJobs.id, workflowOutbox.jobId))
    .where(
      and(
        lte(workflowOutbox.nextAttemptAt, now),
        or(
          eq(workflowOutbox.status, "pending"),
          and(
            eq(workflowOutbox.status, "dispatching"),
            or(
              isNull(workflowOutbox.leaseExpiresAt),
              lt(workflowOutbox.leaseExpiresAt, now),
            ),
          ),
        ),
      ),
    )
    .limit(limit);
  const batches = new Map<string, { batchId: string; ownerId: string }>();
  for (const row of rows) {
    batches.set(`${row.ownerId}:${row.batchId}`, {
      batchId: row.batchId,
      ownerId: row.ownerId,
    });
  }
  for (const batch of batches.values()) {
    await dispatchBatchOutbox(batch.batchId, batch.ownerId);
  }
  if (rows.length) {
    await db
      .update(workflowOutbox)
      .set({ reconciledAt: new Date(), updatedAt: new Date() })
      .where(inArray(workflowOutbox.id, rows.map((row) => row.outboxId)));
  }
  return { scanned: rows.length, batches: batches.size };
}
