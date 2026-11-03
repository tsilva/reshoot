import { notFound, redirect } from "next/navigation";
import { StudioPage } from "@/components/StudioPage";
import { PROJECT_ID_PATTERN, projectPath } from "@/lib/projects/routes";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ project?: string | string[]; wallet?: string | string[] }> }) {
  const { project, wallet } = await searchParams;
  if (project !== undefined) {
    if (typeof project !== "string" || !PROJECT_ID_PATTERN.test(project)) notFound();
    redirect(projectPath(project) + (wallet === "open" ? "?wallet=open" : ""));
  }

  return <StudioPage walletOpen={wallet === "open"} />;
}
