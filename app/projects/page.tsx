import { AppShell } from "@/components/AppShell";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { listProjects } from "@/lib/projects/service";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await resolveCurrentUser();
  const projects = await listProjects(user.id);
  return (
    <AppShell>
      <ProjectsClient initialProjects={projects} />
    </AppShell>
  );
}
