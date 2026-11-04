export function shotDownloadFilename(input: {
  label: string;
  mimeType: string;
}) {
  const label = input.label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^[_-]+|[_-]+$/g, "") || "shot";
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const extension = extensions[input.mimeType];
  if (!extension) throw new Error("This output format cannot be downloaded.");
  return `${label}.${extension}`;
}

export function projectArchiveBasename(project: { id: string; title: string }) {
  const title = project.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const shortId = project.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase();
  return `reshoot_${title}_${shortId}`;
}

// Legacy shoots can contain repeated perspective labels or approved versions.
// Keep every image without adding internal output IDs to its filename.
export function uniqueShotDownloadFilenames(inputs: Array<{ label: string; mimeType: string }>) {
  const filenames = inputs.map(shotDownloadFilename);
  const reserved = new Set(filenames.map((filename) => filename.toLowerCase()));
  const used = new Set<string>();
  return filenames.map((filename) => {
    const dot = filename.lastIndexOf(".");
    let unique = filename;
    if (used.has(unique.toLowerCase())) {
      let suffix = 2;
      do {
        unique = `${filename.slice(0, dot)}_${suffix++}${filename.slice(dot)}`;
      } while (used.has(unique.toLowerCase()) || reserved.has(unique.toLowerCase()));
    }
    used.add(unique.toLowerCase());
    return unique;
  });
}

export function outputDownloadUrl(projectId: string, outputId: string) {
  return `/api/projects/${projectId}/outputs/${outputId}/download`;
}

export function projectArchiveKey(projectId: string, turntable: boolean, version: 1 | 2 = 2) {
  // Bump the relevant ZIP version if its view bytes or filenames change.
  return `projects/${projectId}/exports/${turntable ? "turntable" : "views"}-v${version}.zip`;
}
