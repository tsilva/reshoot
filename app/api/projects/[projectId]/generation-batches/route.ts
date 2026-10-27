import { z } from "zod";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import {
  createGenerationBatch,
} from "@/lib/generation/batches";
import { resumeGenerationBatch } from "@/lib/generation/resume";
import { requireOwnedProject } from "@/lib/projects/service";

type RouteContext = { params: Promise<{ projectId: string }> };

const batchSchema = z.object({
  quoteId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId } = await context.params;
    await requireOwnedProject(user.id, projectId);
    const parsed = batchSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_batch",
        "The generation confirmation is invalid.",
      );
    }
    const batch = await createGenerationBatch({
      userId: user.id,
      projectId,
      ...parsed.data,
    });
    // The durable supervisor retries dispatch and expires stalled holds even
    // when no browser is open. A failed start can be resumed without a new hold.
    let monitoringStarted = true;
    try { await resumeGenerationBatch(user.id, batch.id); }
    catch { monitoringStarted = false; }
    return Response.json(
      { batchId: batch.id, status: batch.status, monitoringStarted },
      { status: batch.createdAt.getTime() === batch.updatedAt.getTime() ? 201 : 200 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
