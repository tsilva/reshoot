import type { Sharp } from "sharp";

export const MAX_PHONE_LEAN_DEGREES = 3;

// Estimate the in-plane axis of a rigid phone from the middle of its opaque
// silhouette. Ignore rounded corners and faint alpha outside the device.
export async function phoneLeanDegrees(image: Sharp): Promise<number | undefined> {
  const { data, info: { width, height } } = await image.clone()
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
  const rows: Array<{ y: number; center: number }> = [];
  for (let y = 0; y < height; y++) {
    let left = width, right = -1;
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] < 128) continue;
      if (left === width) left = x;
      right = x;
    }
    if (right - left >= 3) rows.push({ y, center: (left + right) / 2 });
  }
  if (rows.length < height / 3) return undefined;

  const trim = Math.floor(rows.length / 4);
  const core = rows.slice(trim, -trim);
  const meanY = core.reduce((sum, row) => sum + row.y, 0) / core.length;
  const meanX = core.reduce((sum, row) => sum + row.center, 0) / core.length;
  const variance = core.reduce((sum, row) => sum + (row.y - meanY) ** 2, 0);
  const covariance = core.reduce((sum, row) => sum + (row.y - meanY) * (row.center - meanX), 0);
  return Math.atan(covariance / variance) * 180 / Math.PI;
}
