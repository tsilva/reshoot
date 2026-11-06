import { providerModel } from "../../lib/generation/agentbridge";
import { and, count, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import sharp from "sharp";
import { RetryableError } from "workflow";
import { db } from "@/lib/db";
import {
  generationAttempts,
  generationBatches,
  generationInputs,
  generationJobs,
  generationOutputs,
  generationQuotes,
  shots,
} from "@/lib/db/schema";
import { captureGeneration, releaseGeneration } from "@/lib/generation/accounting";
import { callProviderJson } from "@/lib/generation/provider-calls";
import { actualImageMime, recoverGenerationOutput } from "@/lib/generation/recovery";
import { buildImageRequest } from "@/lib/generation/request";
import { createOrientationGuide } from "@/lib/generation/orientation-guide";
import { ROTATION_POLICY } from "@/lib/generation/rotation";
import { reviewRotationOutput } from "@/lib/generation/rotation-review";
import { GENERATION_SEQUENCE_POLICY, previousSequenceShots, reviewContextShots, sequenceContextShots, type PreviousGenerationView } from "@/lib/generation/sequence";
import { shotOrientation } from "@/lib/generation/orientation";
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
  | { kind: "terminal" | "duplicate" | "waiting" }
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
    const [quote] = await tx.select({ shots: generationQuotes.shots }).from(generationBatches)
      .innerJoin(generationQuotes, eq(generationQuotes.id, generationBatches.quoteId))
      .where(and(eq(generationBatches.id, job.batchId), eq(generationBatches.ownerId, job.ownerId),
        eq(generationQuotes.ownerId, job.ownerId))).limit(1);
    if (!quote) throw new Error("Generation quote is missing.");
    const previous = previousSequenceShots(quote.shots, job.shotId);
    if (previous?.length) {
      const predecessors = await tx.select({ shotId: generationJobs.shotId, status: generationJobs.status })
        .from(generationJobs).where(and(eq(generationJobs.batchId, job.batchId), eq(generationJobs.ownerId, job.ownerId),
          inArray(generationJobs.shotId, previous.map((shot) => shot.shotId!))));
      if (predecessors.length !== previous.length) throw new Error("Generation sequence jobs are missing.");
      if (predecessors.some((row) => row.status !== "succeeded" && row.status !== "failed")) {
        return { kind: "waiting" as const };
      }
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
  const [job, attempt, shotRecord, inputs] = await Promise.all([
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
      .select({ shot: shots, quoteShots: generationQuotes.shots })
      .from(shots)
      .innerJoin(generationJobs, eq(generationJobs.shotId, shots.id))
      .innerJoin(generationBatches, eq(generationBatches.id, generationJobs.batchId))
      .innerJoin(generationQuotes, eq(generationQuotes.id, generationBatches.quoteId))
      .where(eq(generationJobs.id, jobId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(generationInputs)
      .where(eq(generationInputs.jobId, jobId))
      .orderBy(generationInputs.ordinal),
  ]);
  if (!job || !attempt || !shotRecord) return { status: "duplicate" as const };
  const { shot, quoteShots } = shotRecord;
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
  let providerRequestId: string | undefined;
  let usageCostMicros: number | undefined;
  let missingAnchor = false;
  try {
    const referenceBuffers = await Promise.all(
      inputs.map((input) => getObjectBuffer(input.frozenR2Key)),
    );
    const contextShots = sequenceContextShots(quoteShots, shot.id);
    const reviewShots = reviewContextShots(quoteShots, shot.id);
    const previous = [...new Map([...(contextShots ?? []), ...(reviewShots ?? [])].map((view) => [view.shotId!, view])).values()];
    const previousViews: PreviousGenerationView[] = [];
    const reviewViews: PreviousGenerationView[] = [];
    if (previous?.length) {
      const rows = await db.select({ shotId: generationJobs.shotId, status: generationJobs.status,
        r2Key: generationOutputs.r2Key, mimeType: generationOutputs.mimeType })
        .from(generationJobs).leftJoin(generationOutputs, and(eq(generationOutputs.jobId, generationJobs.id),
          eq(generationOutputs.ownerId, job.ownerId), eq(generationOutputs.projectId, shot.projectId)))
        .where(and(eq(generationJobs.batchId, job.batchId), eq(generationJobs.ownerId, job.ownerId),
          inArray(generationJobs.shotId, previous.map((view) => view.shotId!))));
      for (const prior of previous) {
        const row = rows.find((row) => row.shotId === prior.shotId);
        if (row?.status === "failed") {
          if (quoteShots[0]?.sequencePolicy === GENERATION_SEQUENCE_POLICY && contextShots?.some((view) => view.shotId === prior.shotId)) {
            missingAnchor = true;
            throw new Error("A required cardinal orientation anchor failed.");
          }
          continue;
        }
        if (row?.status !== "succeeded" || !row.r2Key || !row.mimeType) {
          throw new Error("An earlier accepted generation is unavailable.");
        }
        const bytes = await getObjectBuffer(row.r2Key);
        const image = await sharp(bytes).resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
          .flatten({ background: "white" }).webp({ quality: 90 }).toBuffer();
        const view = { ...shotOrientation(prior)!, image: `data:image/webp;base64,${image.toString("base64")}` };
        if (contextShots?.some((item) => item.shotId === prior.shotId)) previousViews.push(view);
        if (reviewShots?.some((item) => item.shotId === prior.shotId)) reviewViews.push(view);
      }
    }
    // Persisted legacy guide identifiers never select category-specific prompts.
    const orientationGuide = await createOrientationGuide(shot);
    const rotationPolicy = quoteShots[0]?.rotationPolicy;
    if (rotationPolicy && (![ROTATION_POLICY, "verified-rotation-v1"].includes(rotationPolicy) || !orientationGuide)) {
      throw new Error("The frozen rotation policy or orientation is unsupported.");
    }
    const request = buildImageRequest({
      model: attempt.providerModel ?? imageProviderConfig.model,
      shot,
      referenceImages: referenceBuffers.map(
        (buffer) => `data:image/webp;base64,${buffer.toString("base64")}`,
      ),
      orientationGuide,
      previousViews,
    });
    const providerKey = requireImageProviderKey();

    const [started] = await db
      .update(generationAttempts)
      .set({ state: "started", startedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(generationAttempts.id, attemptId),
          eq(generationAttempts.state, "claimed"),
        ),
      ).returning({ id: generationAttempts.id });
    // Another step may have started or ended this attempt while references
    // were loading. Only the transition winner sends the paid request.
    if (!started) return { status: "duplicate" as const };
    providerStarted = true;

    const response = await callProviderJson({
      ownerId: job.ownerId,
      projectId: shot.projectId,
      generationAttemptId: attemptId,
      purpose: "image",
      endpoint: imageProviderConfig.endpoint,
      apiKey: providerKey,
      headers: {
        "HTTP-Referer": imageProviderConfig.referer,
        "X-OpenRouter-Title": imageProviderConfig.title,
      },
      body: { ...request, model: providerModel(request.model) },
      timeoutMs: 280_000,
    });
    const result = response.result as {
      data?: Array<{ b64_json?: string; media_type?: string }>;
      error?: { message?: string };
    } | null;
    usageCostMicros = response.usageCostMicros;
    providerRequestId = response.providerRequestId;

    if (!response.ok) {
      console.warn("Image provider rejected generation", { jobId, attemptId, status: response.status,
        model: request.model, referenceCount: request.input_references.length, promptLength: request.prompt.length });
      await releaseGeneration({
        jobId,
        attemptId,
        attemptState: response.status >= 500 ? "ambiguous" : "failed",
        failureCode: response.status === 400 ? "request_rejected" : "provider_failure",
        publicError: response.status === 429 ? "The image provider is busy. Credits were released."
          : response.status >= 500 ? "The image provider was unavailable. Credits were released."
          : "The image provider rejected this view's request. Credits were released.",
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
    const alpha = metadata.hasAlpha ? (await image.stats()).channels.at(-1) : undefined;
    if (!alpha || alpha.min !== 0 || alpha.max === 0) {
      await releaseGeneration({
        jobId,
        attemptId,
        attemptState: "failed",
        failureCode: "invalid_transparent_output",
        publicError: "This shot did not have a transparent background. Credits were released.",
        privateError: "The provider output lacked both fully transparent and visible pixels.",
        providerRequestId,
        usageCostMicros,
      });
      return { status: "failed" as const };
    }
    if (rotationPolicy && orientationGuide) {
      const candidate = await image.clone().resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "white" }).webp({ quality: 90 }).toBuffer();
      const failure = await reviewRotationOutput({
        ownerId: job.ownerId, projectId: shot.projectId, generationAttemptId: attemptId,
        shot, guide: orientationGuide, references: request.input_references.slice(0, referenceBuffers.length).map((reference) => reference.image_url.url),
        candidate: `data:image/webp;base64,${candidate.toString("base64")}`,
        previousViews: reviewViews, policy: rotationPolicy,
      });
      if (failure) {
        await releaseGeneration({
          jobId, attemptId, attemptState: "failed", failureCode: "invalid_rotation_output",
          publicError: "This view could not be verified at the requested angle. Credits were released.",
          privateError: failure, providerRequestId, usageCostMicros,
        });
        return { status: "failed" as const };
      }
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
      failureCode: providerStarted ? "ambiguous_provider_call" : missingAnchor ? "missing_rotation_anchor" : "technical_failure",
      publicError: missingAnchor ? "A required orientation anchor is unavailable. Credits were released."
        : "This shot could not be generated. Credits were released.",
      privateError: message,
      providerRequestId,
      usageCostMicros,
    });
    return { status: "failed" as const };
  }
}
executeGenerationJob.maxRetries = 2;
