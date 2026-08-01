export const ALLOWED_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_PROJECT_ORIGINALS = 25;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 500 * 1024 * 1024;
export const MAX_GENERATION_REFERENCES = 5;
export const MAX_BATCH_SHOTS = 10;

export function isAllowedUploadMimeType(
  value: string,
): value is (typeof ALLOWED_UPLOAD_MIME_TYPES)[number] {
  return ALLOWED_UPLOAD_MIME_TYPES.includes(
    value as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number],
  );
}
