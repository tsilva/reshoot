import { AppShell } from "@/components/AppShell";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getCreditSummary } from "@/lib/credits/service";
import { listProjects } from "@/lib/projects/service";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await resolveCurrentUser();
  const [projects, credits] = await Promise.all([
    listProjects(user.id),
    getCreditSummary(user.id, user.isDemo),
  ]);
  return (
    <AppShell
      currentUser={{
        displayName: user.displayName,
        email: user.email,
        isDemo: user.isDemo,
        availableCredits: credits.availableCredits,
      }}
    >
      <ProjectsClient initialProjects={projects} />
    </AppShell>
  );
}
