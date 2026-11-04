import { zipSync } from "fflate";
import type { ProjectShot, ProjectSummary, ShotVersion } from "@/lib/api/types";
import { projectArchiveBasename, uniqueShotDownloadFilenames } from "@/lib/projects/downloads";

type ExportProject = Pick<ProjectSummary, "id" | "title">;

export async function exportApprovedShots(project: ExportProject, shots: ProjectShot[], fetchFile = fetch) {
  const approved = shots.flatMap((shot) =>
    shot.versions
      .filter((version) => version.approvedAt || version.selectedAt)
      .map((version) => ({
        version,
        label: shot.label,
      })),
  );
  return exportFiles(project, approved, fetchFile);
}

// Export the same versions shown in the canvas, without changing saved approvals.
export async function exportVisibleShots(project: ExportProject, shots: ProjectShot[], visibleVersions: Record<string, string> = {}, fetchFile = fetch) {
  const visible = shots.flatMap((shot) => {
    const version = shot.versions.find((item) => item.outputId === visibleVersions[shot.id]) ?? shot.versions.at(-1);
    return version ? [{ version, label: shot.label }] : [];
  });
  return exportFiles(project, visible, fetchFile);
}

async function exportFiles(project: ExportProject, outputs: Array<{ version: ShotVersion; label: string }>, fetchFile: typeof fetch) {
  if (!outputs.length) return null;

  const files: Record<string, Uint8Array> = {};
  const folder = projectArchiveBasename(project);
  const filenames = uniqueShotDownloadFilenames(outputs.map(({ label, version }) => ({ label, mimeType: version.mimeType })));
  for (const [index, { version }] of outputs.entries()) {
    const filename = filenames[index];
    try {
      const response = await fetchFile(version.downloadUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      files[`${folder}/${filename}`] = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new Error(`Could not download ${filename}. No ZIP was exported. Please retry.`);
    }
  }
  return zipSync(files, { level: 6 });
}
