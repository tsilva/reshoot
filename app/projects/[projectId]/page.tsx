import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ApiError } from "@/lib/api/errors";
import { findLegacyDemoUser, requirePageUser } from "@/lib/auth/current-user";
import { PROJECT_ID_PATTERN } from "@/lib/projects/routes";
import { getProjectDetail, requireOwnedProject } from "@/lib/projects/service";
import { StudioPage } from "@/components/StudioPage";
import { moveToSharedWorkspace } from "./actions";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ProjectPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ wallet?: string | string[]; move?: string | string[] }>;
}) {
  const [{ projectId }, { wallet, move }] = await Promise.all([params, searchParams]);
  if (!PROJECT_ID_PATTERN.test(projectId)) notFound();
  const user = await requirePageUser(`/projects/${projectId}`);
  const project = await missingAsNull(getProjectDetail(user.id, projectId));
  if (project) return <StudioPage project={project} walletOpen={wallet === "open"} />;

  const legacy = await findLegacyDemoUser();
  if (!legacy || !(await missingAsNull(requireOwnedProject(legacy.id, projectId)))) notFound();

  return (
    <AppShell currentUser={{ displayName: user.displayName, email: user.email, isDemo: user.isDemo }}>
      <main className="product-main deleted-project-state">
        <h1>Move this shoot to your account</h1>
        <p>Its photos and generated views will be private to your signed-in account.</p>
        {move === "busy" ? <p role="alert">Wait for uploads and generation to finish, then try again.</p> : null}
        <form action={moveToSharedWorkspace.bind(null, projectId)}>
          <button className="button primary-button" type="submit">Move shoot</button>
        </form>
      </main>
    </AppShell>
  );
}

async function missingAsNull<T>(request: Promise<T>) {
  try {
    return await request;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
