import { eq, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import {
  assets,
  assetVariants,
  generationOutputs,
  projects,
  shots,
  users,
} from "@/lib/db/schema";
import { putObject, sha256Hex } from "@/lib/storage/r2";

const dataUrl = z
  .string()
  .max(30_000_000)
  .regex(/^data:image\/(png|jpe?g|webp);base64,/i);

const importSchema = z.object({
  title: z.string().trim().min(1).max(120).default("Imported shoot"),
  original: z
    .object({
      filename: z.string().trim().min(1).max(255),
      dataUrl,
    })
    .nullable(),
  shots: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        azimuth: z.number().int().min(-360).max(360).optional(),
        elevation: z.number().int().min(-90).max(90).optional(),
        dataUrl,
        approved: z.boolean().default(false),
      }),
    )
    .max(10)
    .default([]),
});

function decodeImage(value: string) {
  const comma = value.indexOf(",");
  if (comma < 0) throw new ApiError(400, "invalid_legacy_image", "A legacy image is invalid.");
  return Buffer.from(value.slice(comma + 1), "base64");
}

function mimeForFormat(format: string | undefined) {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return null;
}

export async function GET() {
  try {
    const user = await resolveCurrentUser();
    const [row] = await db
      .select({ completedAt: users.legacyImportCompletedAt })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    return Response.json({ completed: Boolean(row?.completedAt) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const parsed = importSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, "invalid_legacy_import", "The saved shoot could not be imported.");
    }

    const [current] = await db
      .select({ completedAt: users.legacyImportCompletedAt })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (current?.completedAt) return Response.json({ completed: true, projectId: null });

    if (!parsed.data.original) {
      await db
        .update(users)
        .set({ legacyImportCompletedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, user.id));
      return Response.json({ completed: true, projectId: null });
    }

    const projectId = crypto.randomUUID();
    const assetId = crypto.randomUUID();
    const originalBuffer = decodeImage(parsed.data.original.dataUrl);
    const originalImage = sharp(originalBuffer, { failOn: "error", animated: false }).rotate();
    const originalMetadata = await originalImage.metadata();
    const originalMime = mimeForFormat(originalMetadata.format);
    if (!originalMime || !originalMetadata.width || !originalMetadata.height) {
      throw new ApiError(400, "invalid_legacy_image", "The saved original is not a supported image.");
    }
    const [originalPreview, originalReference] = await Promise.all([
      originalImage
        .clone()
        .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true }),
      originalImage
        .clone()
        .resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 90 })
        .toBuffer({ resolveWithObject: true }),
    ]);
    const originalPrefix = `users/${user.id}/projects/${projectId}/originals/${assetId}`;
    const originalKey = `${originalPrefix}/source`;
    const originalPreviewKey = `${originalPrefix}/preview.webp`;
    const originalReferenceKey = `${originalPrefix}/reference.webp`;

    const preparedShots = await Promise.all(
      parsed.data.shots.map(async (legacyShot, index) => {
        const outputId = crypto.randomUUID();
        const shotId = crypto.randomUUID();
        const buffer = decodeImage(legacyShot.dataUrl);
        const image = sharp(buffer, { failOn: "error", animated: false }).rotate();
        const metadata = await image.metadata();
        const mimeType = mimeForFormat(metadata.format);
        if (!mimeType || !metadata.width || !metadata.height) {
          throw new ApiError(400, "invalid_legacy_image", `Saved shot ${index + 1} is invalid.`);
        }
        const preview = await image
          .clone()
          .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 84 })
          .toBuffer();
        const prefix = `users/${user.id}/projects/${projectId}/imports/${outputId}`;
        return {
          outputId,
          shotId,
          legacyShot,
          buffer,
          preview,
          mimeType,
          width: metadata.width,
          height: metadata.height,
          outputKey: `${prefix}/output`,
          previewKey: `${prefix}/preview.webp`,
        };
      }),
    );

    await Promise.all([
      putObject({
        key: originalKey,
        body: originalBuffer,
        mimeType: originalMime,
        checksumSha256: sha256Hex(originalBuffer),
      }),
      putObject({ key: originalPreviewKey, body: originalPreview.data, mimeType: "image/webp" }),
      putObject({ key: originalReferenceKey, body: originalReference.data, mimeType: "image/webp" }),
      ...preparedShots.flatMap((shot) => [
        putObject({
          key: shot.outputKey,
          body: shot.buffer,
          mimeType: shot.mimeType,
          checksumSha256: sha256Hex(shot.buffer),
        }),
        putObject({ key: shot.previewKey, body: shot.preview, mimeType: "image/webp" }),
      ]),
    ]);

    const importedAt = new Date();
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select id from ${users} where ${users.id} = ${user.id}::uuid for update`,
      );
      const [locked] = await tx
        .select({ completedAt: users.legacyImportCompletedAt })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      if (locked?.completedAt) return;

      await tx.insert(projects).values({
        id: projectId,
        ownerId: user.id,
        title: parsed.data.title,
        status: "ready",
        primaryAssetId: assetId,
      });
      await tx.insert(assets).values({
        id: assetId,
        ownerId: user.id,
        projectId,
        status: "ready",
        originalFilename: parsed.data.original!.filename,
        r2Key: originalKey,
        mimeType: originalMime,
        sizeBytes: originalBuffer.byteLength,
        checksumSha256: sha256Hex(originalBuffer),
        width: originalMetadata.width,
        height: originalMetadata.height,
        uploadedAt: importedAt,
      });
      await tx.insert(assetVariants).values([
        {
          assetId,
          ownerId: user.id,
          kind: "preview",
          r2Key: originalPreviewKey,
          sizeBytes: originalPreview.data.byteLength,
          checksumSha256: sha256Hex(originalPreview.data),
          width: originalPreview.info.width,
          height: originalPreview.info.height,
        },
        {
          assetId,
          ownerId: user.id,
          kind: "generation_reference",
          r2Key: originalReferenceKey,
          sizeBytes: originalReference.data.byteLength,
          checksumSha256: sha256Hex(originalReference.data),
          width: originalReference.info.width,
          height: originalReference.info.height,
        },
      ]);
      for (const shot of preparedShots) {
        await tx.insert(shots).values({
          id: shot.shotId,
          ownerId: user.id,
          projectId,
          label: shot.legacyShot.label,
          azimuth: shot.legacyShot.azimuth,
          elevation: shot.legacyShot.elevation,
        });
        await tx.insert(generationOutputs).values({
          id: shot.outputId,
          ownerId: user.id,
          projectId,
          shotId: shot.shotId,
          version: 1,
          r2Key: shot.outputKey,
          previewR2Key: shot.previewKey,
          mimeType: shot.mimeType,
          sizeBytes: shot.buffer.byteLength,
          checksumSha256: sha256Hex(shot.buffer),
          width: shot.width,
          height: shot.height,
          approvedAt: shot.legacyShot.approved ? importedAt : null,
          selectedAt: shot.legacyShot.approved ? importedAt : null,
        });
      }
      await tx
        .update(users)
        .set({ legacyImportCompletedAt: importedAt, updatedAt: importedAt })
        .where(eq(users.id, user.id));
    });

    return Response.json({ completed: true, projectId }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
