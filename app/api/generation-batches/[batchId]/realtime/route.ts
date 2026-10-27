import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { sealBatchRealtime } from "@/lib/generation/realtime";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  let response: Response;
  try {
    const user = await resolveCurrentUser();
    const { batchId } = await context.params;
    if (!z.string().uuid().safeParse(batchId).success) {
      throw new ApiError(400, "invalid_batch", "The generation batch is invalid.");
    }
    response = Response.json(await sealBatchRealtime(user.id, batchId));
  } catch (error) {
    response = apiErrorResponse(error);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
