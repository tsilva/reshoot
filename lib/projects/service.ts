import "server-only";

import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assets,
  assetVariants,
  generationBatches,
  generationOutputs,
  projects,
  shots,
} from "@/lib/db/schema";
import { ApiError } from "@/lib/api/errors";
import type {
  Asset,
  ProjectDetail,
  ProjectShot,
  ProjectSummary,
} from "@/lib/api/types";
import { signRead } from "@/lib/storage/r2";

export async function requireOwnedProject(userId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.ownerId, userId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);

  if (!project) {
    throw new ApiError(404, "project_not_found", "Project not found.");
  }
  return project;
}

async function projectCounts(projectId: string, userId: string) {
  const [originals, generated] = await Promise.all([
    db
      .select({ value: count() })
      .from(assets)
      .where(
        and(
          eq(assets.projectId, projectId),
          eq(assets.ownerId, userId),
          eq(assets.kind, "original"),
          eq(assets.status, "ready"),
        ),
      ),
    db
      .select({ value: count() })
      .from(generationOutputs)
      .where(
        and(
          eq(generationOutputs.projectId, projectId),
          eq(generationOutputs.ownerId, userId),
        ),
      ),
  ]);
  return {
    originalCount: originals[0]?.value ?? 0,
    generatedCount: generated[0]?.value ?? 0,
  };
}

async function primaryPreview(primaryAssetId: string | null, userId: string) {
  if (!primaryAssetId) return null;
  const [variant] = await db
    .select({ key: assetVariants.r2Key })
    .from(assetVariants)
    .innerJoin(assets, eq(assets.id, assetVariants.assetId))
    .where(
      and(
        eq(assetVariants.assetId, primaryAssetId),
        eq(assetVariants.ownerId, userId),
        eq(assets.ownerId, userId),
        eq(assetVariants.kind, "preview"),
      ),
    )
    .limit(1);
  return variant ? signRead(variant.key) : null;
}

function publicProjectStatus(status: typeof projects.$inferSelect.status) {
  return status === "deleted" ? "archived" : status;
}

export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.ownerId, userId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.updatedAt));

  return Promise.all(
    rows.map(async (project) => ({
      id: project.id,
      title: project.title,
      status: publicProjectStatus(project.status),
      ...(await projectCounts(project.id, userId)),
      primaryPreviewUrl: await primaryPreview(project.primaryAssetId, userId),
      updatedAt: project.updatedAt.toISOString(),
    })),
  );
}

export async function getProjectDetail(
  userId: string,
  projectId: string,
): Promise<ProjectDetail> {
  const project = await requireOwnedProject(userId, projectId);
  const [assetRows, variantRows, shotRows, outputRows, activeBatchRows, counts] =
    await Promise.all([
      db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.projectId, projectId),
            eq(assets.ownerId, userId),
            ne(assets.status, "deleted"),
          ),
        )
        .orderBy(asc(assets.createdAt)),
      db
        .select()
        .from(assetVariants)
        .where(eq(assetVariants.ownerId, userId)),
      db
        .select()
        .from(shots)
        .where(and(eq(shots.projectId, projectId), eq(shots.ownerId, userId)))
        .orderBy(asc(shots.createdAt)),
      db
        .select()
        .from(generationOutputs)
        .where(
          and(
            eq(generationOutputs.projectId, projectId),
            eq(generationOutputs.ownerId, userId),
          ),
        )
        .orderBy(asc(generationOutputs.createdAt)),
      db
        .select({ id: generationBatches.id })
        .from(generationBatches)
        .where(
          and(
            eq(generationBatches.projectId, projectId),
            eq(generationBatches.ownerId, userId),
            inArray(generationBatches.status, ["held", "queued", "running"]),
          ),
        )
        .orderBy(desc(generationBatches.createdAt))
        .limit(1),
      projectCounts(projectId, userId),
    ]);

  const variantsByAsset = new Map(
    variantRows.map((variant) => [`${variant.assetId}:${variant.kind}`, variant]),
  );

  const publicAssets: Asset[] = await Promise.all(
    assetRows.map(async (asset) => {
      const preview = variantsByAsset.get(`${asset.id}:preview`);
      return {
        id: asset.id,
        kind: asset.kind,
        status: asset.status === "deleted" ? "failed" : asset.status,
        filename: asset.originalFilename,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        isPrimary: project.primaryAssetId === asset.id,
        previewUrl: preview ? await signRead(preview.r2Key) : null,
        originalUrl: asset.status === "ready" ? await signRead(asset.r2Key) : null,
        createdAt: asset.createdAt.toISOString(),
      };
    }),
  );

  const outputsByShot = new Map<string, typeof outputRows>();
  for (const output of outputRows) {
    const values = outputsByShot.get(output.shotId) ?? [];
    values.push(output);
    outputsByShot.set(output.shotId, values);
  }

  const publicShots: ProjectShot[] = await Promise.all(
    shotRows.map(async (shot) => ({
      id: shot.id,
      label: shot.label,
      presetKey: shot.presetKey,
      azimuth: shot.azimuth,
      elevation: shot.elevation,
      versions: await Promise.all(
        (outputsByShot.get(shot.id) ?? []).map(async (output) => ({
          outputId: output.id,
          version: output.version,
          previewUrl: await signRead(output.previewR2Key),
          downloadUrl: await signRead(output.r2Key),
          approvedAt: output.approvedAt?.toISOString() ?? null,
          selectedAt: output.selectedAt?.toISOString() ?? null,
          createdAt: output.createdAt.toISOString(),
        })),
      ),
    })),
  );

  return {
    id: project.id,
    title: project.title,
    status: publicProjectStatus(project.status),
    ...counts,
    primaryPreviewUrl: await primaryPreview(project.primaryAssetId, userId),
    updatedAt: project.updatedAt.toISOString(),
    assets: publicAssets,
    shots: publicShots,
    activeBatchId: activeBatchRows[0]?.id ?? null,
  };
}
