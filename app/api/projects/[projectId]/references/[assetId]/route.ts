import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { assets, creditAccounts, projects, shots } from "@/lib/db/schema";

export async function DELETE(_request: Request, context: { params: Promise<{ projectId: string; assetId: string }> }) {
  try {
    const user = await resolveCurrentUser();
    const { projectId, assetId } = await context.params;
    await db.transaction(async (tx) => {
      // Share confirmation's account lock so references cannot disappear after
      // generation has validated them and reserved credits.
      await tx.execute(sql`select id from ${creditAccounts} where ${creditAccounts.userId} = ${user.id}::uuid for update`);
      const [project] = await tx.select().from(projects).where(and(
        eq(projects.id, projectId), eq(projects.ownerId, user.id), isNull(projects.deletedAt),
      )).limit(1).for("update");
      if (!project) throw new ApiError(404, "project_not_found", "Project not found.");
      const [shot] = await tx.select({ id: shots.id }).from(shots).where(and(
        eq(shots.projectId, projectId), eq(shots.ownerId, user.id),
      )).limit(1);
      if (shot || !["draft", "ready"].includes(project.status)) {
        throw new ApiError(409, "references_locked", "Photos cannot be removed after generation starts.");
      }
      const [removed] = await tx.update(assets).set({
        status: "failed", failureCode: "removed_reference", updatedAt: new Date(),
      }).where(and(
        eq(assets.id, assetId), eq(assets.projectId, projectId), eq(assets.ownerId, user.id),
        eq(assets.kind, "original"), eq(assets.status, "ready"),
      )).returning({ id: assets.id });
      if (!removed) throw new ApiError(404, "reference_not_found", "Photo not found.");
      const [next] = await tx.select({ id: assets.id }).from(assets).where(and(
        eq(assets.projectId, projectId), eq(assets.ownerId, user.id),
        eq(assets.kind, "original"), eq(assets.status, "ready"),
      )).orderBy(asc(assets.createdAt), asc(assets.id)).limit(1);
      await tx.update(projects).set({
        primaryAssetId: project.primaryAssetId === assetId ? next?.id ?? null : project.primaryAssetId,
        status: next ? "ready" : "draft", updatedAt: new Date(),
      }).where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)));
      // Keep original objects and variants under the existing retention policy.
      // Unused quotes referencing this photo fail confirmation's ready check.
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
