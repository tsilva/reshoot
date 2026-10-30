import assert from "node:assert/strict";
import sharp from "sharp";

// Known sample materials only. These bands avoid the doll's moving feet,
// the mug's handle and the handbag's handles; never anchor to a panel seam.
const bodyBands = {
  "linen-doll": [0.4, 0.55],
  "ceramic-mug": [0.94, 0.98],
  "leather-handbag": [0.55, 0.85],
};

export async function measureSample(bytes, product) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rows = new Uint32Array(info.height);
  const columns = new Uint32Array(info.width);
  const left = new Int32Array(info.height).fill(info.width);
  const right = new Int32Array(info.height).fill(-1);
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const index = (y * info.width + x) * info.channels;
    const low = Math.min(data[index], data[index + 1], data[index + 2]);
    const high = Math.max(data[index], data[index + 1], data[index + 2]);
    // The bag also casts a faint brown shadow: require leather saturation so
    // that shadow cannot move the measured base from one angle to the next.
    const material = product === "leather-handbag"
      ? data[index] > 70 && data[index + 1] > 35 && data[index] - data[index + 1] > 25 && data[index] - data[index + 2] > 45
      : high - low > 15 && low < 240;
    if (material) {
      rows[y]++;
      columns[x]++;
      left[y] = Math.min(left[y], x);
      right[y] = x;
    }
  }
  const occupiedRows = Array.from(rows.keys()).filter((y) => rows[y] >= Math.max(3, info.width * 0.003));
  const occupiedColumns = Array.from(columns.keys()).filter((x) => columns[x] >= Math.max(3, info.height * 0.003));
  assert(occupiedRows.length && occupiedColumns.length, `Product silhouette missing: ${product}`);
  const bounds = {
    left: occupiedColumns[0], right: occupiedColumns.at(-1),
    top: occupiedRows[0], bottom: occupiedRows.at(-1),
  };
  const band = bodyBands[product];
  assert(band, `Unknown sample product: ${product}`);
  const start = Math.round(bounds.top + (bounds.bottom - bounds.top) * band[0]);
  const end = Math.round(bounds.top + (bounds.bottom - bounds.top) * band[1]);
  const centers = [];
  for (let y = start; y <= end; y++) {
    if (rows[y] >= Math.max(3, info.width * 0.003)) centers.push((left[y] + right[y]) / 2);
  }
  assert(centers.length, `Product body missing: ${product}`);
  centers.sort((a, b) => a - b);
  return { width: info.width, height: info.height, bounds, bodyAxisX: centers[Math.floor(centers.length / 2)], bodyBand: band };
}
