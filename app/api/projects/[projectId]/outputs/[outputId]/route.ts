import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { generationOutputs } from "@/lib/db/schema";
import { requireOwnedProject } from "@/lib/projects/service";

type RouteContext = {
  params: Promise<{ projectId: string; outputId: string }>;
};

const outputSchema = z
  .object({
    approved: z.boolean().optional(),
    selected: z.boolean().optional(),
  })
  .refine((value) => value.approved !== undefined || value.selected !== undefined);

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId, outputId } = await context.params;
    await requireOwnedProject(user.id, projectId);
    const parsed = outputSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, "invalid_output_update", "The review update is invalid.");
    }
    const [output] = await db
      .update(generationOutputs)
      .set({
        ...(parsed.data.approved !== undefined
          ? { approvedAt: parsed.data.approved ? new Date() : null }
          : {}),
        ...(parsed.data.selected !== undefined
          ? { selectedAt: parsed.data.selected ? new Date() : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(generationOutputs.id, outputId),
          eq(generationOutputs.projectId, projectId),
          eq(generationOutputs.ownerId, user.id),
        ),
      )
      .returning({ id: generationOutputs.id });
    if (!output) throw new ApiError(404, "output_not_found", "Output not found.");
    return Response.json({ output });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
