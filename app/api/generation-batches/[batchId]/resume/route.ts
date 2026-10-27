import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { resumeGenerationBatch } from "@/lib/generation/resume";

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const expected = new URL(request.url);
    // Next's local server normalizes request.url to localhost, even when the
    // browser connects to 127.0.0.1. Host preserves the actual browser authority.
    expected.host = request.headers.get("host") ?? expected.host;
    if (request.headers.get("origin") !== expected.origin) {
      throw new ApiError(403, "invalid_origin", "Open your workspace to resume generation.");
    }
    const user = await resolveCurrentUser();
    const { batchId } = await context.params;
    if (!z.string().uuid().safeParse(batchId).success) throw new ApiError(400, "invalid_batch", "The generation batch is invalid.");
    await resumeGenerationBatch(user.id, batchId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
