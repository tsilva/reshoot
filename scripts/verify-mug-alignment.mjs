import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

// Run after capturing fresh, paused browser frames in this directory.
// Detect the unobstructed body edges just above the foot, below every handle.
// This measures rendered pixels rather than checking the configured offsets.
const directory = process.argv[2] ?? "design/qa/ceramic-mug/alignment";

async function measure(name, geometry) {
  const screenshot = sharp(join(directory, `${name}.png`));
  const metadata = await screenshot.metadata();
  const sx = metadata.width / geometry.viewport.width;
  const sy = metadata.height / geometry.viewport.height;
  const { viewer, imageWidth } = geometry;
  const region = {
    left: Math.floor((viewer.left + (viewer.width - imageWidth) / 2) * sx),
    top: Math.floor((viewer.top + imageWidth * 920 / 1254) * sy),
    width: Math.ceil(imageWidth * sx),
    height: Math.ceil(imageWidth * 30 / 1254 * sy),
  };
  const { data, info } = await screenshot.extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const centers = [];
  for (let y = 0; y < info.height; y++) {
    let left = info.width;
    let right = -1;
    for (let x = 0; x < info.width; x++) {
      const pixel = (y * info.width + x) * info.channels;
      if (Math.min(data[pixel], data[pixel + 1], data[pixel + 2]) < 180) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
    if (right >= left) centers.push((left + right) / 2);
  }
  assert(centers.length >= Math.floor(info.height / 2), `Missing body edges: ${name}`);
  centers.sort((a, b) => a - b);
  return { frame: name, center: (region.left + centers[Math.floor(centers.length / 2)]) / sx };
}

const desktopGeometry = JSON.parse(await readFile(join(directory, "viewport.json"), "utf8"));
const mobileGeometry = JSON.parse(await readFile(join(directory, "mobile-viewport.json"), "utf8"));
const before = await Promise.all(["before-front", "before-back"].map((name) => measure(name, desktopGeometry)));
const desktop = await Promise.all(Array.from({ length: 8 }, (_, index) => measure(`after-${index}`, desktopGeometry)));
const mobile = await Promise.all(Array.from({ length: 8 }, (_, index) => measure(`mobile-after-${index}`, mobileGeometry[index])));
const spread = (frames) => Math.max(...frames.map((frame) => frame.center)) - Math.min(...frames.map((frame) => frame.center));
const result = {
  method: "Median rendered body-edge center in the unobstructed band above the foot. Screenshot coordinates normalized to the captured CSS viewport.",
  before: { frames: before, horizontalSpread: spread(before) },
  desktop: { frames: desktop, horizontalSpread: spread(desktop) },
  mobile: { frames: mobile, horizontalSpread: spread(mobile) },
  tolerance: 2,
};
await writeFile(join(directory, "measurement.json"), `${JSON.stringify(result, null, 2)}\n`);
assert(result.desktop.horizontalSpread <= result.tolerance, "Desktop mug alignment exceeds two CSS pixels");
assert(result.mobile.horizontalSpread <= result.tolerance, "Mobile mug alignment exceeds two CSS pixels");
console.log(JSON.stringify({ before: result.before.horizontalSpread, desktop: result.desktop.horizontalSpread, mobile: result.mobile.horizontalSpread, tolerance: result.tolerance }));
