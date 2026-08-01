import { apiErrorResponse } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getGenerationBatchStatus } from "@/lib/generation/status";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { batchId } = await context.params;
    return Response.json({ batch: await getGenerationBatchStatus(user.id, batchId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
