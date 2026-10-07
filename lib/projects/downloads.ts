export function shotDownloadFilename(input: {
  label: string;
  outputId: string;
  version: number;
  mimeType: string;
}) {
  const label = input.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shot";
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const extension = extensions[input.mimeType];
  if (!extension) throw new Error("This output format cannot be downloaded.");
  return `${label}-v${input.version}-${input.outputId}.${extension}`;
}

export function outputDownloadUrl(projectId: string, outputId: string) {
  return `/api/projects/${projectId}/outputs/${outputId}/download`;
}
