import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { generationAttempts, generationJobs, shots } from "@/lib/db/schema";
import { requireOwnedProject } from "@/lib/projects/service";
import { signRead } from "@/lib/storage/r2";
import { parseRejectedRotation } from "./rotation-diagnostics";

export async function getRejectedViews(ownerId: string, projectId: string) {
  await requireOwnedProject(ownerId, projectId);
  const attempts = await db.select({
    id: generationAttempts.id, label: shots.label, privateError: generationAttempts.privateError,
    previewKey: generationAttempts.previewR2Key,
  }).from(generationAttempts)
    .innerJoin(generationJobs, eq(generationJobs.id, generationAttempts.jobId))
    .innerJoin(shots, eq(shots.id, generationJobs.shotId))
    .where(and(eq(shots.projectId, projectId), eq(shots.ownerId, ownerId),
      eq(generationAttempts.ownerId, ownerId), eq(generationJobs.ownerId, ownerId),
      eq(generationAttempts.state, "failed"), eq(generationJobs.status, "failed"),
      eq(generationJobs.failureCode, "invalid_rotation_output")))
    .orderBy(desc(generationAttempts.createdAt)).limit(32);
  return (await Promise.all(attempts.map(async (attempt) => {
    const review = parseRejectedRotation(attempt.privateError);
    if (!review) return null;
    return { attemptId: attempt.id, label: attempt.label, review,
      previewUrl: review.previewAvailable ? await signRead(attempt.previewKey, 300) : null };
  }))).filter((view) => view !== null);
}
