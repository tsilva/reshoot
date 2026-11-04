import "server-only";

import { projectArchiveKey } from "@/lib/projects/downloads";
import { deleteObject } from "@/lib/storage/r2";

export async function deleteProjectArchives(projectId: string) {
  const keys = [
    projectArchiveKey(projectId, false),
    projectArchiveKey(projectId, true),
    projectArchiveKey(projectId, false, 1),
    projectArchiveKey(projectId, true, 1),
  ];
  // Finish every request before releasing the project's publication lock,
  // including when a failed deletion makes the transaction roll back.
  const results = await Promise.allSettled(keys.map((key) => deleteObject(key)));
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return keys.length;
}
