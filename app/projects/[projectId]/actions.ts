"use server";

import { notFound, redirect } from "next/navigation";
import { findLegacyDemoUser, requirePageUser } from "@/lib/auth/current-user";
import { PROJECT_ID_PATTERN, projectPath } from "@/lib/projects/routes";
import { moveLegacyProject } from "@/lib/projects/transfer";

export async function moveToSharedWorkspace(projectId: string) {
  if (typeof projectId !== "string" || !PROJECT_ID_PATTERN.test(projectId)) notFound();
  const legacy = await findLegacyDemoUser();
  if (!legacy) notFound();
  const shared = await requirePageUser(projectPath(projectId));
  const result = await moveLegacyProject(projectId, legacy.id, shared.id);
  if (result === "unavailable") notFound();
  redirect(projectPath(projectId) + (result === "busy" ? "?move=busy" : ""));
}
