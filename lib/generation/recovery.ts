import "server-only";
import sharp from "sharp";
import type { generationJobs, generationAttempts, shots } from "@/lib/db/schema";
import { captureGeneration } from "@/lib/generation/accounting";
import { getObjectBuffer, headObject, putObject, sha256Hex } from "@/lib/storage/r2";

export function actualImageMime(format: string | undefined) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return null;
}

async function objectExists(key: string) {
  try {
    await headObject(key);
    return true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
      ?.httpStatusCode;
    if (status === 404) return false;
    throw error;
  }
}

export async function recoverGenerationOutput(input: {
  job: typeof generationJobs.$inferSelect;
  attempt: typeof generationAttempts.$inferSelect;
  shot: typeof shots.$inferSelect;
}) {
  if (!(await objectExists(input.attempt.outputR2Key))) return false;
  const output = await getObjectBuffer(input.attempt.outputR2Key);
  const image = sharp(output, { failOn: "error", animated: false });
  const metadata = await image.metadata();
  const mimeType = actualImageMime(metadata.format);
  if (!mimeType || !metadata.width || !metadata.height) return false;
  if (!(await objectExists(input.attempt.previewR2Key))) {
    const preview = await image
      .clone()
      .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84 })
      .toBuffer();
    await putObject({
      key: input.attempt.previewR2Key,
      body: preview,
      mimeType: "image/webp",
    });
  }
  await captureGeneration({
    jobId: input.job.id,
    attemptId: input.attempt.id,
    output: {
      projectId: input.shot.projectId,
      ownerId: input.job.ownerId,
      shotId: input.shot.id,
      version: input.job.version,
      r2Key: input.attempt.outputR2Key,
      previewR2Key: input.attempt.previewR2Key,
      mimeType,
      sizeBytes: output.byteLength,
      checksumSha256: sha256Hex(output),
      width: metadata.width,
      height: metadata.height,
    },
    providerRequestId: input.attempt.providerRequestId ?? undefined,
    usageCostMicros: input.attempt.usageCostMicros ?? undefined,
  });
  return true;
}
