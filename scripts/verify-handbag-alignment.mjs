import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

// Capture fresh paused frames and per-frame geometry in Brave before running.
// Detect the leather silhouette in rendered screenshots, independently of CSS.
const directory = process.argv[2] ?? "design/qa/leather-handbag/alignment";

async function measure(surface) {
  const geometry = JSON.parse(await readFile(join(directory, `${surface}.json`), "utf8"));
  const frames = [];
  for (let index = 0; index < geometry.length; index++) {
    const { viewer, imageWidth, viewport } = geometry[index];
    assert(viewer.top >= 0 && viewer.top + viewer.height <= viewport.height, `Viewer must be fully visible: ${surface}-${index}`);
    const image = sharp(join(directory, `${surface}-${index}.png`));
    const metadata = await image.metadata();
    const sx = metadata.width / viewport.width;
    const sy = metadata.height / viewport.height;
    const region = {
      left: Math.floor((viewer.left + (viewer.width - imageWidth) / 2) * sx),
      top: Math.floor(viewer.top * sy),
      width: Math.ceil(imageWidth * sx),
      height: Math.ceil(imageWidth * sy),
    };
    const { data, info } = await image.extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let left = info.width;
    let right = -1;
    let top = info.height;
    let bottom = -1;
    const strength = (x, y) => {
      if (x < 0 || y < 0 || x >= info.width || y >= info.height) return -1;
      if (x < info.width * 0.16 && y < info.height * 0.16) return -1;
      const pixel = (y * info.width + x) * info.channels;
      const r = data[pixel], g = data[pixel + 1], b = data[pixel + 2];
      return Math.min(r - 70, g - 35, r - g - 25, r - b - 45);
    };
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const value = strength(x, y);
      if (value > 0) {
        // Interpolate threshold crossings instead of rounding every edge to
        // an integer screenshot pixel at different display densities.
        const crossing = (neighbor) => neighbor <= 0 ? value / (value - neighbor) : 0;
        left = Math.min(left, x - crossing(strength(x - 1, y)));
        right = Math.max(right, x + crossing(strength(x + 1, y)));
        top = Math.min(top, y - crossing(strength(x, y - 1)));
        bottom = Math.max(bottom, y + crossing(strength(x, y + 1)));
      }
    }
    assert(right > left && bottom > top, `Missing leather silhouette: ${surface}-${index}`);
    frames.push({ index, center: (region.left + (left + right) / 2) / sx - (viewer.left + viewer.width / 2), top: (region.top + top) / sy - viewer.top, bottom: (region.top + bottom) / sy - viewer.top });
  }
  const spread = (key) => Math.max(...frames.map((frame) => frame[key])) - Math.min(...frames.map((frame) => frame[key]));
  return { frames, centerSpread: spread("center"), topSpread: spread("top"), bottomSpread: spread("bottom") };
}

const result = {
  method: "Leather silhouette bounds with interpolated color-threshold crossings in fresh browser screenshots, normalized to CSS coordinates relative to the viewer. Per-frame geometry removes page-scroll movement.",
  desktop: await measure("desktop"),
  mobile: await measure("mobile"),
  centerTolerance: 2,
  // The color-isolated, textured leather edge includes rasterization and shadow
  // variations; record those separately from movement of the rotation axis.
  edgeTolerance: 2,
};
await writeFile(join(directory, "measurement.json"), `${JSON.stringify(result, null, 2)}\n`);
for (const [name, surface] of [["desktop", result.desktop], ["mobile", result.mobile]]) {
  assert(surface.centerSpread <= result.centerTolerance, `${name} rotation axis exceeds two CSS pixels: ${surface.centerSpread}`);
  for (const key of ["topSpread", "bottomSpread"]) assert(surface[key] <= result.edgeTolerance, `${name} silhouette ${key} exceeds two CSS pixels: ${surface[key]}`);
}
console.log(JSON.stringify({ desktop: { center: result.desktop.centerSpread, top: result.desktop.topSpread, bottom: result.desktop.bottomSpread }, mobile: { center: result.mobile.centerSpread, top: result.mobile.topSpread, bottom: result.mobile.bottomSpread }, centerTolerance: result.centerTolerance, edgeTolerance: result.edgeTolerance }));
