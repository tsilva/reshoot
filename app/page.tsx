import { StudioHome } from "@/components/StudioHome";
import { findCurrentUser } from "@/lib/auth/current-user";
import { getCreditSummary } from "@/lib/credits/service";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { getProjectDetail, listProjects } from "@/lib/projects/service";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ project?: string | string[]; wallet?: string | string[] }> }) {
  const query = await searchParams;
  const user = await findCurrentUser();
  const [credits, projects] = user
    ? await Promise.all([getCreditSummary(user.id, user.isDemo), listProjects(user.id)])
    : [null, []];

  let project = null;
  if (user && query.project) {
    if (typeof query.project !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.project)) notFound();
    try { project = await getProjectDetail(user.id, query.project); }
    catch (error) {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    }
  }
  return <StudioHome initialCredits={credits} initialProjects={projects} initialProject={project} initialWalletOpen={query.wallet === "open"} />;
}
