import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { isMissingArchive, prepareProjectArchive } from "@/lib/projects/archive";
import { projectArchiveKey } from "@/lib/projects/downloads";
import { requireOwnedProject } from "@/lib/projects/service";
import { getObjectStream } from "@/lib/storage/r2";

type RouteContext = { params: Promise<{ projectId: string }> };
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId } = await context.params;
    const archive = await prepareProjectArchive(user.id, projectId);
    if (!archive) throw new ApiError(409, "archive_not_ready", "The views are still being prepared.");
    const downloadUrl = `/api/projects/${projectId}/download${archive.turntable ? "?turntable=1" : ""}`;
    return Response.json({ downloadUrl }, { headers: privateHeaders });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId } = await context.params;
    const project = await requireOwnedProject(user.id, projectId);
    const turntable = new URL(request.url).searchParams.get("turntable") === "1";
    const title = project.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return new Response(await getObjectStream(projectArchiveKey(projectId, turntable)), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${title || "project"}-reshoot.zip"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (isMissingArchive(error)) {
      return apiErrorResponse(new ApiError(404, "archive_not_found", "Reopen the shoot to prepare its download."));
    }
    return apiErrorResponse(error);
  }
}
