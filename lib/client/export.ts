import { zipSync } from "fflate";
import type { ProjectShot, ShotVersion } from "@/lib/api/types";
import { shotDownloadFilename } from "@/lib/projects/downloads";

export async function exportApprovedShots(shots: ProjectShot[], fetchFile = fetch) {
  const approved = shots.flatMap((shot) =>
    shot.versions
      .filter((version) => version.approvedAt || version.selectedAt)
      .map((version) => ({
        version,
        filename: shotDownloadFilename({ label: shot.label, ...version }),
      })),
  );
  return exportFiles(approved, fetchFile);
}

// Export the same versions shown in the canvas, without changing saved approvals.
export async function exportVisibleShots(shots: ProjectShot[], visibleVersions: Record<string, string> = {}, fetchFile = fetch) {
  const visible = shots.flatMap((shot) => {
    const version = shot.versions.find((item) => item.outputId === visibleVersions[shot.id]) ?? shot.versions.at(-1);
    return version ? [{ version, filename: shotDownloadFilename({ label: shot.label, ...version }) }] : [];
  });
  return exportFiles(visible, fetchFile);
}

async function exportFiles(outputs: Array<{ version: ShotVersion; filename: string }>, fetchFile: typeof fetch) {
  if (!outputs.length) return null;

  const files: Record<string, Uint8Array> = {};
  for (const { version, filename } of outputs) {
    try {
      // The authenticated download route signs a fresh private-storage URL per request.
      const response = await fetchFile(version.downloadUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      files[filename] = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new Error(`Could not download ${filename}. No ZIP was exported. Please retry.`);
    }
  }
  return zipSync(files, { level: 6 });
}
