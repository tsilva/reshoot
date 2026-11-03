import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assets,
  assetVariants,
  creditAccounts,
  generationBatches,
  generationOutputs,
  projects,
  shots,
} from "@/lib/db/schema";

export async function moveLegacyProject(projectId: string, fromOwner: string, toOwner: string) {
  return db.transaction(async (tx) => {
    // Serialize with batch confirmations in the old workspace.
    await tx.select({ id: creditAccounts.id }).from(creditAccounts)
      .where(eq(creditAccounts.userId, fromOwner)).for("update");

    const projectMatch = and(eq(projects.id, projectId), isNull(projects.deletedAt));
    const [project] = await tx.select({ ownerId: projects.ownerId }).from(projects)
      .where(projectMatch).for("update");
    if (project?.ownerId === toOwner) return "moved";
    if (project?.ownerId !== fromOwner) return "unavailable";

    const originalAssets = and(eq(assets.projectId, projectId), eq(assets.ownerId, fromOwner));
    const [activeBatch] = await tx.select({ id: generationBatches.id }).from(generationBatches)
      .where(and(
        eq(generationBatches.projectId, projectId),
        eq(generationBatches.ownerId, fromOwner),
        inArray(generationBatches.status, ["held", "queued", "running"]),
      )).limit(1);
    const [activeUpload] = await tx.select({ id: assets.id }).from(assets)
      .where(and(originalAssets, inArray(assets.status, ["pending", "uploaded", "processing"])))
      .limit(1);
    if (activeBatch || activeUpload) return "busy";

    await tx.update(assetVariants).set({ ownerId: toOwner }).where(and(
      eq(assetVariants.ownerId, fromOwner),
      inArray(assetVariants.assetId, tx.select({ id: assets.id }).from(assets).where(originalAssets)),
    ));
    await tx.update(assets).set({ ownerId: toOwner }).where(originalAssets);
    await tx.update(shots).set({ ownerId: toOwner })
      .where(and(eq(shots.projectId, projectId), eq(shots.ownerId, fromOwner)));
    await tx.update(generationOutputs).set({ ownerId: toOwner })
      .where(and(eq(generationOutputs.projectId, projectId), eq(generationOutputs.ownerId, fromOwner)));
    // Finished jobs and financial records remain with the workspace that paid for them.
    await tx.update(projects).set({ ownerId: toOwner, updatedAt: new Date() }).where(projectMatch);
    return "moved";
  });
}
