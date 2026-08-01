import { and, eq, inArray } from "drizzle-orm";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { requireOwnedProject } from "@/lib/projects/service";
import { deleteObject } from "@/lib/storage/r2";

type RouteContext = { params: Promise<{ projectId: string; assetId: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId, assetId } = await context.params;
    await requireOwnedProject(user.id, projectId);
    const [asset] = await db
      .select()
      .from(assets)
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.projectId, projectId),
          eq(assets.ownerId, user.id),
          inArray(assets.status, ["pending", "uploaded", "processing"]),
        ),
      )
      .limit(1);
    if (!asset) throw new ApiError(404, "upload_not_found", "Upload not found.");
    try {
      await deleteObject(asset.r2Key);
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status !== 404) throw error;
    }
    await db
      .update(assets)
      .set({ status: "failed", failureCode: "client_upload_aborted", updatedAt: new Date() })
      .where(and(eq(assets.id, asset.id), eq(assets.ownerId, user.id)));
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
