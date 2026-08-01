import { and, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import {
  isAllowedUploadMimeType,
  MAX_PROJECT_BYTES,
  MAX_PROJECT_ORIGINALS,
  MAX_UPLOAD_BYTES,
} from "@/lib/projects/limits";
import { requireOwnedProject } from "@/lib/projects/service";
import { signUpload } from "@/lib/storage/r2";

type RouteContext = { params: Promise<{ projectId: string }> };

const signSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId } = await context.params;
    await requireOwnedProject(user.id, projectId);
    const parsed = signSchema.safeParse(await readJson(request));
    if (!parsed.success || !isAllowedUploadMimeType(parsed.data?.mimeType ?? "")) {
      throw new ApiError(
        400,
        "invalid_upload",
        "Choose a JPG, PNG, or WebP image up to 20 MB.",
      );
    }

    const [usage] = await db
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
          inArray(assets.status, ["pending", "uploaded", "processing", "ready"]),
        ),
      );

    if ((usage?.totalCount ?? 0) >= MAX_PROJECT_ORIGINALS) {
      throw new ApiError(
        409,
        "project_photo_limit",
        "A project can contain up to 25 original photos.",
      );
    }
    if (Number(usage?.totalBytes ?? 0) + parsed.data.sizeBytes > MAX_PROJECT_BYTES) {
      throw new ApiError(
        409,
        "project_storage_limit",
        "This upload would exceed the 500 MB project limit.",
      );
    }

    const assetId = crypto.randomUUID();
    const r2Key = `users/${user.id}/projects/${projectId}/originals/${assetId}/source`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await db.insert(assets).values({
      id: assetId,
      ownerId: user.id,
      projectId,
      originalFilename: parsed.data.filename,
      r2Key,
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.sizeBytes,
      checksumSha256: parsed.data.checksumSha256.toLowerCase(),
      uploadExpiresAt: expiresAt,
    });

    const signed = await signUpload({
      key: r2Key,
      mimeType: parsed.data.mimeType,
      checksumSha256: parsed.data.checksumSha256,
    });

    return Response.json(
      {
        assetId,
        uploadUrl: signed.url,
        requiredHeaders: signed.headers,
        expiresAt: expiresAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
