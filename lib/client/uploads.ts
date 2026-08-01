import { apiRequest } from "@/lib/client/api";

export const CLIENT_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validateUploadFile(file: File) {
  if (!CLIENT_UPLOAD_MIME_TYPES.has(file.type)) {
    return "Choose a JPG, PNG, or WebP image.";
  }
  if (file.size > 20 * 1024 * 1024) return "Each photo must be 20 MB or smaller.";
  return null;
}

async function checksumSha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress?: (progress: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("The photo upload failed. Please retry."));
    });
    request.addEventListener("error", () =>
      reject(new Error("The photo upload was interrupted.")),
    );
    request.send(file);
  });
}

export async function uploadProjectFile(input: {
  projectId: string;
  file: File;
  onProgress?: (progress: number) => void;
}) {
  const invalid = validateUploadFile(input.file);
  if (invalid) throw new Error(invalid);
  const checksum = await checksumSha256(input.file);
  const signed = await apiRequest<{
    assetId: string;
    uploadUrl: string;
    requiredHeaders: Record<string, string>;
  }>(`/api/projects/${input.projectId}/uploads/sign`, {
    method: "POST",
    body: JSON.stringify({
      filename: input.file.name,
      mimeType: input.file.type,
      sizeBytes: input.file.size,
      checksumSha256: checksum,
    }),
  });
  try {
    await putWithProgress(
      signed.uploadUrl,
      input.file,
      signed.requiredHeaders,
      input.onProgress,
    );
    input.onProgress?.(1);
    return await apiRequest<{ asset: { id: string; previewUrl: string } }>(
      `/api/projects/${input.projectId}/uploads/finalize`,
      { method: "POST", body: JSON.stringify({ assetId: signed.assetId }) },
    );
  } catch (error) {
    await apiRequest(`/api/projects/${input.projectId}/uploads/${signed.assetId}`, {
      method: "DELETE",
    }).catch(() => undefined);
    throw error;
  }
}
