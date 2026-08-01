import { and, count, eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import { z } from "zod";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { assets, assetVariants, projects } from "@/lib/db/schema";
import {
  MAX_PROJECT_BYTES,
  MAX_PROJECT_ORIGINALS,
  MAX_UPLOAD_BYTES,
} from "@/lib/projects/limits";
import { requireOwnedProject } from "@/lib/projects/service";
import {
  getObjectBuffer,
  headObject,
  putObject,
  sha256Hex,
  signRead,
} from "@/lib/storage/r2";

type RouteContext = { params: Promise<{ projectId: string }> };

const finalizeSchema = z.object({ assetId: z.string().uuid() });
const mimeByFormat = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId } = await context.params;
    await requireOwnedProject(user.id, projectId);
    const parsed = finalizeSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, "invalid_asset", "The uploaded asset is invalid.");
    }

    const [asset] = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, parsed.data.assetId),
          eq(assets.projectId, projectId),
          eq(assets.ownerId, user.id),
          eq(assets.kind, "original"),
        ),
      )
      .limit(1);

    if (!asset) {
      throw new ApiError(404, "asset_not_found", "Upload not found.");
    }
    if (asset.status === "ready") {
      const [preview] = await db
        .select()
        .from(assetVariants)
        .where(
          and(
            eq(assetVariants.assetId, asset.id),
            eq(assetVariants.kind, "preview"),
            eq(assetVariants.ownerId, user.id),
          ),
        )
        .limit(1);
      return Response.json({
        asset: {
          id: asset.id,
          status: "ready",
          width: asset.width,
          height: asset.height,
          previewUrl: preview ? await signRead(preview.r2Key) : null,
        },
      });
    }
    if (asset.uploadExpiresAt && asset.uploadExpiresAt < new Date()) {
      throw new ApiError(410, "upload_expired", "The upload URL has expired.");
    }

    const head = await headObject(asset.r2Key);
    if (head.ContentLength !== asset.sizeBytes || asset.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new ApiError(
        400,
        "upload_size_mismatch",
        "The stored upload does not match the signed file size.",
      );
    }
    if (head.ContentType !== asset.mimeType) {
      throw new ApiError(
        400,
        "upload_type_mismatch",
        "The stored upload does not match the signed file type.",
      );
    }
    if (
      head.Metadata?.sha256 &&
      head.Metadata.sha256.toLowerCase() !== asset.checksumSha256
    ) {
      throw new ApiError(
        400,
        "upload_checksum_mismatch",
        "The stored upload failed checksum verification.",
      );
    }

    const original = await getObjectBuffer(asset.r2Key);
    if (sha256Hex(original) !== asset.checksumSha256) {
      throw new ApiError(
        400,
        "upload_checksum_mismatch",
        "The stored upload failed checksum verification.",
      );
    }

    const image = sharp(original, { failOn: "error", animated: false });
    const metadata = await image.metadata();
    const actualMime = metadata.format
      ? mimeByFormat[metadata.format as keyof typeof mimeByFormat]
      : undefined;
    if (!actualMime || actualMime !== asset.mimeType || !metadata.width || !metadata.height) {
      throw new ApiError(
        400,
        "invalid_image",
        "The uploaded file is not a valid JPG, PNG, or WebP image.",
      );
    }

    const normalized = image.clone().rotate();
    const [preview, reference] = await Promise.all([
      normalized
        .clone()
        .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true }),
      normalized
        .clone()
        .resize({
          width: 1536,
          height: 1536,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 90 })
        .toBuffer({ resolveWithObject: true }),
    ]);

    const prefix = `users/${user.id}/projects/${projectId}/originals/${asset.id}`;
    const previewKey = `${prefix}/preview.webp`;
    const referenceKey = `${prefix}/reference.webp`;
    const [previewChecksum, referenceChecksum] = await Promise.all([
      putObject({ key: previewKey, body: preview.data, mimeType: "image/webp" }),
      putObject({ key: referenceKey, body: reference.data, mimeType: "image/webp" }),
    ]);

    await db.transaction(async (tx) => {
      const [usage] = await tx
        .select({
          totalBytes: sql<number>`coalesce(sum(${assets.sizeBytes}), 0)::bigint`,
          totalCount: count(),
        })
        .from(assets)
        .where(
          and(
            eq(assets.projectId, projectId),
            eq(assets.ownerId, user.id),
            eq(assets.kind, "original"),
            inArray(assets.status, ["uploaded", "processing", "ready"]),
          ),
        );
      if ((usage?.totalCount ?? 0) >= MAX_PROJECT_ORIGINALS) {
        throw new ApiError(409, "project_photo_limit", "Project photo limit reached.");
      }
      if (Number(usage?.totalBytes ?? 0) + asset.sizeBytes > MAX_PROJECT_BYTES) {
        throw new ApiError(409, "project_storage_limit", "Project storage limit reached.");
      }

      await tx
        .insert(assetVariants)
        .values([
          {
            assetId: asset.id,
            ownerId: user.id,
            kind: "preview",
            r2Key: previewKey,
            sizeBytes: preview.data.byteLength,
            checksumSha256: previewChecksum,
            width: preview.info.width,
            height: preview.info.height,
          },
          {
            assetId: asset.id,
            ownerId: user.id,
            kind: "generation_reference",
            r2Key: referenceKey,
            sizeBytes: reference.data.byteLength,
            checksumSha256: referenceChecksum,
            width: reference.info.width,
            height: reference.info.height,
          },
        ])
        .onConflictDoNothing();
      await tx
        .update(assets)
        .set({
          status: "ready",
          mimeType: actualMime,
          width: metadata.autoOrient?.width ?? metadata.width,
          height: metadata.autoOrient?.height ?? metadata.height,
          uploadedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(assets.id, asset.id), eq(assets.ownerId, user.id)));
      await tx
        .update(projects)
        .set({
          primaryAssetId: sql`coalesce(${projects.primaryAssetId}, ${asset.id}::uuid)`,
          status: "ready",
          updatedAt: new Date(),
        })
        .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)));
    });

    return Response.json({
      asset: {
        id: asset.id,
        status: "ready",
        width: metadata.autoOrient?.width ?? metadata.width,
        height: metadata.autoOrient?.height ?? metadata.height,
        previewUrl: await signRead(previewKey),
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
