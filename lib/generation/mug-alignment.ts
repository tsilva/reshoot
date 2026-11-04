import type { Sharp } from "sharp";

// A handled mug has one large enclosed transparent region at side-on angles.
// This checks that landmark only; it does not certify glaze, 3D geometry or
// distinguish an edge-on front handle from a handle hidden behind the body.
export async function mugOrientationFailure(image: Sharp, azimuth: number): Promise<string | undefined> {
  const { data, info: { width, height } } = await image.clone()
    .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
    .extractChannel("alpha").raw().toBuffer({ resolveWithObject: true });
  const opaqueRows: Array<{ y: number; left: number; right: number }> = [];
  for (let y = 0; y < height; y++) {
    let left = width, right = -1;
    for (let x = 0; x < width; x++) if (data[y * width + x] >= 128) {
      left = Math.min(left, x); right = x;
    }
    if (right > left) opaqueRows.push({ y, left, right });
  }
  if (opaqueRows.length < height / 4) return undefined;
  // Estimate the body axis below the handle, avoiding its silhouette width.
  const lowerBody = opaqueRows.slice(Math.floor(opaqueRows.length * .85), Math.floor(opaqueRows.length * .95));
  const centers = lowerBody.map((row) => (row.left + row.right) / 2).sort((a, b) => a - b);
  const bodyCenter = centers[Math.floor(centers.length / 2)];
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let hole: { area: number; center: number } | undefined;
  for (let start = 0; start < data.length; start++) {
    if (data[start] >= 128 || visited[start]) continue;
    let read = 0, write = 1, area = 0, sumX = 0, minY = height, maxY = 0, edge = false;
    queue[0] = start; visited[start] = 1;
    while (read < write) {
      const index = queue[read++], x = index % width, y = Math.floor(index / width);
      area++; sumX += x; minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) edge = true;
      for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1, y < height - 1 ? index + width : -1]) {
        if (next < 0 || visited[next] || data[next] >= 128) continue;
        visited[next] = 1; queue[write++] = next;
      }
    }
    if (!edge && area > width * height * .001 && maxY - minY > opaqueRows.length * .12 && (!hole || area > hole.area)) {
      hole = { area, center: sumX / area };
    }
  }
  const angle = ((azimuth % 360) + 360) % 360;
  if (angle === 90 || angle === 270) {
    if (hole) return `An open handle loop is visible at ${angle} degrees; it must be ${angle === 90 ? "edge-on in front" : "hidden behind the body"}.`;
    return undefined;
  }
  if (!hole) return angle === 0 || angle === 180 ? "The required side-on handle loop is missing." : undefined;
  const expectedRight = angle < 90 || angle > 270;
  const offset = hole.center - bodyCenter;
  if ((expectedRight && offset < width * .03) || (!expectedRight && offset > -width * .03)) {
    return `The handle loop is on the wrong side at ${angle} degrees; expected image ${expectedRight ? "right" : "left"}.`;
  }
  return undefined;
}
