import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { generationBatches, generationJobs, generationOutputs, generationQuotes, shots } from "@/lib/db/schema";
import { turntableAngles } from "@/lib/generation/phone-turntable";
import { shotOrientation } from "@/lib/generation/request";

export async function getPhoneTurntable(userId: string, projectId: string) {
  const rows = await db.select({
    batchId: generationBatches.id,
    label: shots.label,
    presetKey: shots.presetKey,
    azimuth: shots.azimuth,
    elevation: shots.elevation,
    outputId: generationOutputs.id,
    key: generationOutputs.r2Key,
    quoteShots: generationQuotes.shots,
  }).from(generationOutputs)
    .innerJoin(shots, eq(shots.id, generationOutputs.shotId))
    .innerJoin(generationJobs, eq(generationJobs.id, generationOutputs.jobId))
    .innerJoin(generationBatches, eq(generationBatches.id, generationJobs.batchId))
    .innerJoin(generationQuotes, eq(generationQuotes.id, generationBatches.quoteId))
    .where(and(
      eq(generationOutputs.projectId, projectId),
      eq(generationOutputs.ownerId, userId),
      eq(shots.ownerId, userId),
      eq(generationJobs.ownerId, userId),
      eq(generationBatches.ownerId, userId),
      eq(generationBatches.projectId, projectId),
      eq(generationQuotes.ownerId, userId),
      eq(generationBatches.status, "succeeded"),
    ));
  if (rows.length !== turntableAngles.length || rows.some((row) =>
    row.batchId !== rows[0].batchId || (row.elevation ?? 0) !== 0 || row.quoteShots[0]?.orientationGuideKind !== "upright-phone-v2")) return null;

  const byAngle = new Map(rows.flatMap((row) => {
    const orientation = shotOrientation(row);
    return orientation ? [[orientation.azimuth, { ...row, azimuth: orientation.azimuth }] as const] : [];
  }));
  return turntableAngles.every((angle) => byAngle.has(angle)) ? byAngle : null;
}
