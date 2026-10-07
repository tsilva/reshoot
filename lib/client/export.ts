import { zipSync } from "fflate";
import type { ProjectShot } from "@/lib/api/types";
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
  if (!approved.length) return null;

  const files: Record<string, Uint8Array> = {};
  for (const { version, filename } of approved) {
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
