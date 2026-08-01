import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProjectStudioClient } from "@/components/projects/ProjectStudioClient";
import { ApiError } from "@/lib/api/errors";
import type { CreditSummary } from "@/lib/api/types";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getCreditSummary } from "@/lib/credits/service";
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
  let credits: CreditSummary;
  try {
    [project, credits] = await Promise.all([
      getProjectDetail(user.id, projectId),
      getCreditSummary(user.id, user.isDemo),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  return (
    <AppShell
      currentUser={{
        displayName: user.displayName,
        email: user.email,
        isDemo: user.isDemo,
        availableCredits: credits.availableCredits,
      }}
    >
      <ProjectStudioClient initialProject={project} />
    </AppShell>
  );
}
