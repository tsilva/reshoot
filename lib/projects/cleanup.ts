import "server-only";

import { and, eq, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assets,
  assetVariants,
  generationInputs,
  generationOutputs,
  projects,
} from "@/lib/db/schema";
import { deleteObject } from "@/lib/storage/r2";

export async function cleanupExpiredProjectObjects(limit = 100) {
  const expiredProjects = await db
    .select({ id: projects.id, ownerId: projects.ownerId })
    .from(projects)
    .where(and(eq(projects.status, "deleted"), lte(projects.purgeAfter, new Date())))
    .limit(limit);
  let deletedObjects = 0;
  for (const project of expiredProjects) {
    const assetRows = await db
      .select({ asset: assets, variant: assetVariants })
      .from(assets)
      .leftJoin(assetVariants, eq(assetVariants.assetId, assets.id))
      .leftJoin(generationInputs, eq(generationInputs.assetId, assets.id))
      .where(
        and(
          eq(assets.projectId, project.id),
          eq(assets.ownerId, project.ownerId),
          ne(assets.status, "deleted"),
          isNull(generationInputs.id),
        ),
      );
    const grouped = new Map<string, { source: string; variants: string[] }>();
    for (const row of assetRows) {
      const current = grouped.get(row.asset.id) ?? {
        source: row.asset.r2Key,
        variants: [],
      };
      if (row.variant) current.variants.push(row.variant.r2Key);
      grouped.set(row.asset.id, current);
    }
    for (const [assetId, object] of grouped) {
      for (const key of [object.source, ...object.variants]) {
        await deleteObject(key);
        deletedObjects += 1;
      }
      await db
        .update(assets)
        .set({ status: "deleted", updatedAt: new Date() })
        .where(and(eq(assets.id, assetId), eq(assets.ownerId, project.ownerId)));
    }

    const outputRows = await db
      .select({
        output: generationOutputs.r2Key,
        preview: generationOutputs.previewR2Key,
      })
      .from(generationOutputs)
      .where(
        and(
          eq(generationOutputs.projectId, project.id),
          eq(generationOutputs.ownerId, project.ownerId),
        ),
      );
    for (const output of outputRows) {
      await Promise.all([deleteObject(output.output), deleteObject(output.preview)]);
      deletedObjects += 2;
    }
    if (outputRows.length) {
      await db
        .delete(generationOutputs)
        .where(
          and(
            eq(generationOutputs.projectId, project.id),
            eq(generationOutputs.ownerId, project.ownerId),
          ),
        );
    }
  }
  return { projects: expiredProjects.length, deletedObjects };
}
