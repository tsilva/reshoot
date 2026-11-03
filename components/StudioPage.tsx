import type { ProjectDetail } from "@/lib/api/types";
import { StudioHome } from "@/components/StudioHome";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getCreditSummary } from "@/lib/credits/service";
import { listProjects } from "@/lib/projects/service";

export async function StudioPage({ project, showLibrary, walletOpen }: {
  project?: ProjectDetail;
  showLibrary?: boolean;
  walletOpen?: boolean;
}) {
  const user = await resolveCurrentUser();
  const [credits, projects] = await Promise.all([
    getCreditSummary(user.id, user.isDemo),
    project ? [] : listProjects(user.id),
  ]);

  return <StudioHome initialCredits={credits} initialProjects={projects} project={project} showLibrary={showLibrary} initialWalletOpen={walletOpen} />;
}
