import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProjectStudioClient } from "@/components/projects/ProjectStudioClient";
import { ApiError } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getProjectDetail } from "@/lib/projects/service";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await resolveCurrentUser();
  const { projectId } = await params;
  let project;
  try {
    project = await getProjectDetail(user.id, projectId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  return (
    <AppShell>
      <ProjectStudioClient initialProject={project} />
    </AppShell>
  );
}
