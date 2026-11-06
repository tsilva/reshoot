import { z } from "zod";
import { ApiError, apiErrorResponse } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getRejectedViews } from "@/lib/generation/rejected-views";

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  let response: Response;
  try {
    const user = await resolveCurrentUser();
    const { projectId } = await context.params;
    if (!z.uuid().safeParse(projectId).success) throw new ApiError(400, "invalid_project", "Invalid project ID.");
    response = Response.json({ views: await getRejectedViews(user.id, projectId) });
  } catch (error) { response = apiErrorResponse(error); }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
