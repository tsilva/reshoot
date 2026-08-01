import { z } from "zod";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { listProjects } from "@/lib/projects/service";

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export async function GET() {
  try {
    const user = await resolveCurrentUser();
    return Response.json({ projects: await listProjects(user.id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const parsed = createProjectSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_project",
        "Enter a project name up to 120 characters.",
      );
    }

    const [project] = await db
      .insert(projects)
      .values({ ownerId: user.id, title: parsed.data.title })
      .returning();

    return Response.json(
      {
        project: {
          id: project.id,
          title: project.title,
          status: project.status,
          originalCount: 0,
          generatedCount: 0,
          primaryPreviewUrl: null,
          updatedAt: project.updatedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
