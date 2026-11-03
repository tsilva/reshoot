import { notFound } from "next/navigation";
import { StudioHome } from "@/components/StudioHome";
import { ApiError } from "@/lib/api/errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import { getCreditSummary } from "@/lib/credits/service";
import { PROJECT_ID_PATTERN } from "@/lib/projects/routes";
import { getProjectDetail, listProjects } from "@/lib/projects/service";

export async function StudioPage({ projectId, showLibrary, walletOpen }: {
  projectId?: string;
  showLibrary?: boolean;
  walletOpen?: boolean;
}) {
  if (projectId !== undefined && !PROJECT_ID_PATTERN.test(projectId)) notFound();

  const user = await findCurrentUser();
  if (!user) {
    if (projectId !== undefined) notFound();
    return <StudioHome initialCredits={null} initialProjects={[]} showLibrary={showLibrary} />;
  }

  const [credits, projects, project] = await Promise.all([
    getCreditSummary(user.id, user.isDemo),
    projectId === undefined ? listProjects(user.id) : [],
    projectId === undefined ? null : getProjectDetail(user.id, projectId).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    }),
  ]);

  return <StudioHome initialCredits={credits} initialProjects={projects} project={project} showLibrary={showLibrary} initialWalletOpen={walletOpen} />;
}
