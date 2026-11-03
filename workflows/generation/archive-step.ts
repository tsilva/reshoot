import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { generationBatches, generationJobs, projects } from "@/lib/db/schema";
import { prepareProjectArchive } from "@/lib/projects/archive";

export async function prepareGenerationArchive(source: { jobId: string } | { batchId: string }) {
  "use step";
  const [project] = await db.select({ id: projects.id, ownerId: projects.ownerId })
    .from(generationBatches)
    .innerJoin(projects, eq(projects.id, generationBatches.projectId))
    .where(and(
      inArray(generationBatches.status, ["succeeded", "partial"]),
      isNull(projects.deletedAt),
      "jobId" in source
        ? eq(generationBatches.id, db.select({ batchId: generationJobs.batchId })
          .from(generationJobs).where(eq(generationJobs.id, source.jobId)))
        : eq(generationBatches.id, source.batchId),
    ))
    .limit(1);
  if (project) await prepareProjectArchive(project.ownerId, project.id);
}
