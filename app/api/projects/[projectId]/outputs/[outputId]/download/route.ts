import { and, eq } from "drizzle-orm";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { generationOutputs, shots } from "@/lib/db/schema";
import { shotDownloadFilename } from "@/lib/projects/downloads";
import { requireOwnedProject } from "@/lib/projects/service";
import { signDownload } from "@/lib/storage/r2";

type RouteContext = { params: Promise<{ projectId: string; outputId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId, outputId } = await context.params;
    await requireOwnedProject(user.id, projectId);
    const [row] = await db
      .select({ output: generationOutputs, label: shots.label })
      .from(generationOutputs)
      .innerJoin(shots, eq(shots.id, generationOutputs.shotId))
      .where(and(
        eq(generationOutputs.id, outputId),
        eq(generationOutputs.projectId, projectId),
        eq(generationOutputs.ownerId, user.id),
        eq(shots.ownerId, user.id),
      ))
      .limit(1);
    if (!row) throw new ApiError(404, "output_not_found", "Output not found.");
    const filename = shotDownloadFilename({
      label: row.label,
      outputId: row.output.id,
      version: row.output.version,
      mimeType: row.output.mimeType,
    });
    return new Response(null, {
      status: 302,
      headers: {
        Location: await signDownload(row.output.r2Key, filename),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
