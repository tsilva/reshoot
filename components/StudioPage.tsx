import type { ProjectDetail } from "@/lib/api/types";
import { PublicHome } from "@/components/PublicHome";
import { StudioHome } from "@/components/StudioHome";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { findCurrentUser } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export async function StudioPage({ project, showLibrary, walletOpen }: {
  project?: ProjectDetail;
  showLibrary?: boolean;
  walletOpen?: boolean;
}) {
  await connection();
  const user = await findCurrentUser();
  if (!user) {
    if (showLibrary || walletOpen) redirect(`/login?returnTo=${encodeURIComponent(showLibrary ? "/projects" : "/?wallet=open")}`);
    return <PublicHome />;
  }
  const [{ getCreditSummary }, { listProjects }] = await Promise.all([
    import("@/lib/credits/service"), import("@/lib/projects/service"),
  ]);
  const [credits, projects] = await Promise.all([
    getCreditSummary(user.id, user.isDemo),
    project ? [] : listProjects(user.id),
  ]);

  return <AuthProvider key={user.id}>
    <StudioHome initialCredits={credits} initialProjects={projects} currentUser={{ displayName: user.displayName, email: user.email, isDemo: user.isDemo }} project={project} showLibrary={showLibrary} initialWalletOpen={walletOpen} />
  </AuthProvider>;
}
