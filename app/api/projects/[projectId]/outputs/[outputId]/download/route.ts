import { and, eq } from "drizzle-orm";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { generationOutputs, shots } from "@/lib/db/schema";
import { renderPhoneTurntable } from "@/lib/generation/phone-turntable";
import { getPhoneTurntable } from "@/lib/projects/phone-turntable";
import { shotDownloadFilename } from "@/lib/projects/downloads";
import { requireOwnedProject } from "@/lib/projects/service";
import { getObjectBuffer, getObjectStream } from "@/lib/storage/r2";

type RouteContext = { params: Promise<{ projectId: string; outputId: string }> };

export async function GET(request: Request, context: RouteContext) {
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
    const mode = new URL(request.url).searchParams.get("turntable");
    if (mode === "preview" || mode === "download") {
      const sources = await getPhoneTurntable(user.id, projectId);
      const target = sources && [...sources.values()].find((source) => source.outputId === outputId);
      if (!sources || target?.azimuth == null) throw new ApiError(404, "output_not_found", "Turntable view not found.");
      const frame = await renderPhoneTurntable(target.azimuth, async (face) => getObjectBuffer(sources.get(face)!.key));
      const filename = shotDownloadFilename({
        label: row.label, mimeType: "image/png",
      });
      return new Response(new Uint8Array(frame), {
        headers: {
          "Content-Type": "image/png",
          "Content-Disposition": `${mode === "download" ? "attachment" : "inline"}; filename="${filename}"`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const filename = shotDownloadFilename({
      label: row.label,
      mimeType: row.output.mimeType,
    });
    return new Response(await getObjectStream(row.output.r2Key), {
      headers: {
        "Content-Type": row.output.mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
