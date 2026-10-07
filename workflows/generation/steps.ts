import { and, count, desc, eq, gt, ne, sql } from "drizzle-orm";
import sharp from "sharp";
import { RetryableError } from "workflow";
import { db } from "@/lib/db";
import {
  generationAttempts,
  generationBatches,
  generationInputs,
  generationJobs,
  shots,
} from "@/lib/db/schema";
import { captureGeneration, releaseGeneration } from "@/lib/generation/accounting";
import { actualImageMime, recoverGenerationOutput } from "@/lib/generation/recovery";
import { buildImageRequest } from "@/lib/generation/request";
import {
  imageProviderConfig,
  requireImageProviderKey,
} from "@/lib/generation/provider";
import {
  getObjectBuffer,
  putObject,
  sha256Hex,
} from "@/lib/storage/r2";

type ClaimResult =
  | { kind: "terminal" | "duplicate" }
  | { kind: "execute"; attemptId: string; leaseOwner: string };

export async function claimGenerationJob(jobId: string): Promise<ClaimResult> {
  "use step";
  console.info("Claiming generation job", { jobId });
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${generationJobs} where ${generationJobs.id} = ${jobId}::uuid for update`,
    );
    const [job] = await tx
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, jobId))
      .limit(1);
    if (!job || job.status === "succeeded" || job.status === "failed") {
      return { kind: "terminal" as const };
    }

    const now = new Date();
    if (job.status === "running" && job.leaseExpiresAt && job.leaseExpiresAt > now) {
      return { kind: "duplicate" as const };
    }
    const [running] = await tx
      .select({ value: count() })
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.ownerId, job.ownerId),
          eq(generationJobs.status, "running"),
          ne(generationJobs.id, job.id),
          gt(generationJobs.leaseExpiresAt, now),
        ),
      );
    if ((running?.value ?? 0) >= 3) {
      throw new RetryableError("Generation concurrency is full.", {
        retryAfter: "10s",
      });
    }

    const [existingAttempt] = await tx
      .select()
      .from(generationAttempts)
      .where(eq(generationAttempts.jobId, job.id))
      .orderBy(desc(generationAttempts.attemptNumber))
      .limit(1);
    if (
      existingAttempt &&
      ["started", "succeeded", "ambiguous"].includes(existingAttempt.state)
    ) {
      return { kind: "duplicate" as const };
    }
    if (existingAttempt?.state === "failed") {
      return { kind: "terminal" as const };
    }

    const attemptId = existingAttempt?.id ?? crypto.randomUUID();
    const leaseOwner = crypto.randomUUID();
    if (!existingAttempt) {
      const prefix = `users/${job.ownerId}/generations/${job.id}/attempts/${attemptId}`;
      await tx.insert(generationAttempts).values({
        id: attemptId,
        ownerId: job.ownerId,
        jobId: job.id,
        attemptNumber: 1,
        providerModel: imageProviderConfig.model,
        providerEndpoint: imageProviderConfig.endpoint,
        outputR2Key: `${prefix}/output`,
        previewR2Key: `${prefix}/preview.webp`,
      });
    }
    await tx
      .update(generationJobs)
      .set({
        status: "running",
        leaseOwner,
        leaseExpiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        startedAt: job.startedAt ?? now,
        updatedAt: now,
      })
      .where(eq(generationJobs.id, job.id));
    await tx
      .update(generationBatches)
      .set({ status: "running", updatedAt: now })
      .where(eq(generationBatches.id, job.batchId));
    return { kind: "execute" as const, attemptId, leaseOwner };
  });
}
claimGenerationJob.maxRetries = 60;

export async function executeGenerationJob(
  jobId: string,
  attemptId: string,
  leaseOwner: string,
) {
  "use step";
  console.info("Executing generation job", { jobId, attemptId });
  const [job, attempt, shot, inputs] = await Promise.all([
    db.query.generationJobs.findFirst({
      where: and(eq(generationJobs.id, jobId), eq(generationJobs.leaseOwner, leaseOwner)),
    }),
    db.query.generationAttempts.findFirst({
      where: and(
        eq(generationAttempts.id, attemptId),
        eq(generationAttempts.jobId, jobId),
      ),
    }),
    db
      .select({ shot: shots })
      .from(shots)
      .innerJoin(generationJobs, eq(generationJobs.shotId, shots.id))
      .where(eq(generationJobs.id, jobId))
      .limit(1)
      .then((rows) => rows[0]?.shot),
    db
      .select()
      .from(generationInputs)
      .where(eq(generationInputs.jobId, jobId))
      .orderBy(generationInputs.ordinal),
  ]);
  if (!job || !attempt || !shot) return { status: "duplicate" as const };
  if (job.status === "succeeded" || job.status === "failed") {
    return { status: "terminal" as const };
  }
  if (await recoverGenerationOutput({ job, attempt, shot })) {
    return { status: "recovered" as const };
  }
  if (attempt.state === "started" || attempt.state === "ambiguous") {
    await releaseGeneration({
      jobId,
      attemptId,
      attemptState: "ambiguous",
      failureCode: "ambiguous_provider_call",
      publicError: "This shot could not be confirmed. Credits were released.",
      privateError: "A replay found a started attempt without a persisted output.",
      providerRequestId: attempt.providerRequestId ?? undefined,
      usageCostMicros: attempt.usageCostMicros ?? undefined,
    });
    return { status: "ambiguous" as const };
  }

  let providerStarted = false;
  try {
    const referenceBuffers = await Promise.all(
      inputs.map((input) => getObjectBuffer(input.frozenR2Key)),
    );
    const request = buildImageRequest({
      model: attempt.providerModel ?? imageProviderConfig.model,
      shot,
      referenceImages: referenceBuffers.map(
        (buffer) => `data:image/webp;base64,${buffer.toString("base64")}`,
      ),
    });
    const providerKey = requireImageProviderKey();

    await db
      .update(generationAttempts)
      .set({ state: "started", startedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(generationAttempts.id, attemptId),
          eq(generationAttempts.state, "claimed"),
        ),
      );
    providerStarted = true;

    const response = await fetch(attempt.providerEndpoint ?? imageProviderConfig.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": imageProviderConfig.referer,
        "X-OpenRouter-Title": imageProviderConfig.title,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(280_000),
    });
    const requestId = response.headers.get("x-request-id") ?? undefined;
    const result = (await response.json().catch(() => null)) as {
      id?: string;
      data?: Array<{ b64_json?: string; media_type?: string }>;
      usage?: { cost?: number | string };
      error?: { message?: string };
    } | null;
    const usageCost = Number(result?.usage?.cost);
    const usageCostMicros = Number.isFinite(usageCost)
      ? Math.max(0, Math.round(usageCost * 1_000_000))
      : undefined;
    const providerRequestId = requestId ?? result?.id;

    if (!response.ok) {
      await releaseGeneration({
        jobId,
        attemptId,
        attemptState: response.status >= 500 ? "ambiguous" : "failed",
        failureCode: response.status === 400 ? "request_rejected" : "provider_failure",
        publicError: "This shot could not be generated. Credits were released.",
        privateError: result?.error?.message ?? `Image request failed (${response.status}).`,
        providerRequestId,
        usageCostMicros,
      });
      return { status: "failed" as const };
    }

    const encoded = result?.data?.[0]?.b64_json;
    if (!encoded) throw new Error("The paid response did not include raster output.");
    const output = Buffer.from(encoded, "base64");
    const image = sharp(output, { failOn: "error", animated: false });
    const metadata = await image.metadata();
    const mimeType = actualImageMime(metadata.format);
    if (!mimeType || !metadata.width || !metadata.height) {
      throw new Error("The paid response contained an unsupported raster output.");
    }
    await db.update(generationAttempts).set({
      providerRequestId,
      usageCostMicros,
      updatedAt: new Date(),
    }).where(eq(generationAttempts.id, attemptId));
    const preview = await image
      .clone()
      .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer();
    const checksumSha256 = sha256Hex(output);
    await Promise.all([
      putObject({
        key: attempt.outputR2Key,
        body: output,
        mimeType,
        checksumSha256,
      }),
      putObject({
        key: attempt.previewR2Key,
        body: preview,
        mimeType: "image/webp",
      }),
    ]);
    await captureGeneration({
      jobId,
      attemptId,
      output: {
        projectId: shot.projectId,
        ownerId: job.ownerId,
        shotId: shot.id,
        version: job.version,
        r2Key: attempt.outputR2Key,
        previewR2Key: attempt.previewR2Key,
        mimeType,
        sizeBytes: output.byteLength,
        checksumSha256,
        width: metadata.width,
        height: metadata.height,
      },
      providerRequestId,
      usageCostMicros,
    });
    return { status: "succeeded" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed.";
    console.error("Generation job failed", { jobId, attemptId, message });
    await releaseGeneration({
      jobId,
      attemptId,
      attemptState: providerStarted ? "ambiguous" : "failed",
      failureCode: providerStarted ? "ambiguous_provider_call" : "technical_failure",
      publicError: "This shot could not be generated. Credits were released.",
      privateError: message,
    });
    return { status: "failed" as const };
  }
}
executeGenerationJob.maxRetries = 2;
