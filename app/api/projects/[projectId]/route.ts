import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { assets, projects } from "@/lib/db/schema";
import { getProjectDetail, requireOwnedProject } from "@/lib/projects/service";

type RouteContext = { params: Promise<{ projectId: string }> };

const patchProjectSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    primaryAssetId: z.string().uuid().optional(),
  })
  .refine((value) => value.title || value.primaryAssetId, {
    message: "At least one field is required.",
  });

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId } = await context.params;
    return Response.json({ project: await getProjectDetail(user.id, projectId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId } = await context.params;
    await requireOwnedProject(user.id, projectId);
    const parsed = patchProjectSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(400, "invalid_project", "The project update is invalid.");
    }

    if (parsed.data.primaryAssetId) {
      const [asset] = await db
        .select({ id: assets.id })
        .from(assets)
        .where(
          and(
            eq(assets.id, parsed.data.primaryAssetId),
            eq(assets.projectId, projectId),
            eq(assets.ownerId, user.id),
            eq(assets.kind, "original"),
            eq(assets.status, "ready"),
          ),
        )
        .limit(1);
      if (!asset) {
        throw new ApiError(
          400,
          "invalid_primary_asset",
          "Choose a ready original from this project.",
        );
      }
    }

    await db
      .update(projects)
      .set({
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        ...(parsed.data.primaryAssetId
          ? { primaryAssetId: parsed.data.primaryAssetId, status: "ready" as const }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)));

    return Response.json({ project: await getProjectDetail(user.id, projectId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId } = await context.params;
    await requireOwnedProject(user.id, projectId);
    const deletedAt = new Date();
    const purgeAfter = new Date(deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({ status: "deleted", deletedAt, purgeAfter, updatedAt: deletedAt })
        .where(and(eq(projects.id, projectId), eq(projects.ownerId, user.id)));
      await tx
        .update(assets)
        .set({ deletedAt, retainedUntil: purgeAfter, updatedAt: deletedAt })
        .where(and(eq(assets.projectId, projectId), eq(assets.ownerId, user.id)));
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
