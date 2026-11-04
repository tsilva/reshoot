import "server-only";

import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assets,
  assetVariants,
  generationBatches,
  generationQuotes,
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
import { getPhoneTurntable } from "@/lib/projects/phone-turntable";
import { outputDownloadUrl } from "@/lib/projects/downloads";

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

async function projectCoverPreview(projectId: string, primaryAssetId: string | null, userId: string) {
  const [front] = await db
    .select({ key: generationOutputs.previewR2Key })
    .from(generationOutputs)
    .innerJoin(shots, eq(shots.id, generationOutputs.shotId))
    .where(
      and(
        eq(generationOutputs.projectId, projectId),
        eq(generationOutputs.ownerId, userId),
        eq(shots.projectId, projectId),
        eq(shots.ownerId, userId),
        or(
          inArray(shots.azimuth, [-360, 0, 360]),
          and(
            isNull(shots.azimuth),
            or(
              eq(shots.presetKey, "front"),
              and(isNull(shots.presetKey), sql`lower(trim(${shots.label})) in ('front', 'front view')`),
            ),
          ),
        ),
      ),
    )
    .orderBy(desc(generationOutputs.createdAt), desc(generationOutputs.version), desc(generationOutputs.id))
    .limit(1);
  if (front) return signRead(front.key);

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
        eq(assets.projectId, projectId),
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

  const generatingIds = rows.filter((project) => project.status === "generating").map((project) => project.id);
  const latestBatches = generatingIds.length
    ? await db.select({ id: generationBatches.id, projectId: generationBatches.projectId })
      .from(generationBatches).where(and(
        eq(generationBatches.ownerId, userId),
        inArray(generationBatches.projectId, generatingIds),
      )).orderBy(desc(generationBatches.createdAt))
    : [];
  const batchByProject = new Map<string, string>();
  for (const batch of latestBatches) {
    if (!batchByProject.has(batch.projectId)) batchByProject.set(batch.projectId, batch.id);
  }

  return Promise.all(
    rows.map(async (project) => ({
      id: project.id,
      title: project.title,
      status: publicProjectStatus(project.status),
      activeBatchId: batchByProject.get(project.id) ?? null,
      ...(await projectCounts(project.id, userId)),
      primaryPreviewUrl: await projectCoverPreview(project.id, project.primaryAssetId, userId),
      updatedAt: project.updatedAt.toISOString(),
    })),
  );
}

export async function getProjectDetail(
  userId: string,
  projectId: string,
): Promise<ProjectDetail> {
  const project = await requireOwnedProject(userId, projectId);
  // Read the batch first so a terminal batch implies all committed outputs are
  // visible to the queries that follow, even if generation finishes mid-request.
  const [batch] = await db
    .select({ id: generationBatches.id, status: generationBatches.status, quoteShots: generationQuotes.shots })
    .from(generationBatches)
    .innerJoin(generationQuotes, eq(generationQuotes.id, generationBatches.quoteId))
    .where(and(eq(generationBatches.projectId, projectId), eq(generationBatches.ownerId, userId)))
    .orderBy(desc(inArray(generationBatches.status, ["held", "queued", "running"])), desc(generationBatches.createdAt))
    .limit(1);
  const batchActive = batch && ["held", "queued", "running"].includes(batch.status);
  const expectsPhoneTurntable = batch?.quoteShots[0]?.orientationGuideKind === "upright-phone-v2";
  const [assetRows, variantRows, shotRows, outputRows, counts] =
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

  const turntable = !batchActive && expectsPhoneTurntable && shotRows.length === 8 && outputRows.length === 8
    ? await getPhoneTurntable(userId, projectId)
    : null;
  const outputsByShot = new Map<string, typeof outputRows>();
  if (!expectsPhoneTurntable || !batchActive) {
    for (const output of outputRows) {
      const values = outputsByShot.get(output.shotId) ?? [];
      values.push(output);
      outputsByShot.set(output.shotId, values);
    }
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
          mimeType: turntable ? "image/png" : output.mimeType,
          previewUrl: turntable
            ? outputDownloadUrl(projectId, output.id) + "?turntable=preview"
            : await signRead(output.previewR2Key),
          downloadUrl: outputDownloadUrl(projectId, output.id) + (turntable ? "?turntable=download" : ""),
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
    primaryPreviewUrl: await projectCoverPreview(project.id, project.primaryAssetId, userId),
    updatedAt: project.updatedAt.toISOString(),
    assets: publicAssets,
    shots: publicShots,
    activeBatchId: batchActive ? batch.id : null,
    ...(turntable ? { registeredPhoneTurntable: true } : {}),
    ...(expectsPhoneTurntable && !batchActive && !turntable ? { turntableUnavailable: true } : {}),
  };
}
