import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { sampleDisplayPath, sampleDisplaySize, sampleViewOrder } from "./sample-geometry.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const { assets } = await readJson("design/qa/original-rotation/generation.json");
const offsets = await readJson("lib/client/sample-framing.json");

for (const { product, id, output } of assets) {
  const source = sharp(await readFile(new URL(output, root)));
  const { width, height } = await source.metadata();
  assert.equal(width, height, `Expected square sample: ${output}`);

  // Apply the approved top-left scale and translation in a common square canvas.
  const framing = offsets[product][sampleViewOrder.indexOf(id)];
  const size = Math.round(sampleDisplaySize * framing.scale);
  const x = Math.round(framing.x * sampleDisplaySize / width);
  const y = Math.round(framing.y * sampleDisplaySize / height);
  const cropLeft = Math.max(0, -x);
  const cropTop = Math.max(0, -y);
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const cropWidth = Math.min(sampleDisplaySize - left, size - cropLeft);
  const cropHeight = Math.min(sampleDisplaySize - top, size - cropTop);
  const pixels = await source.ensureAlpha().resize(size, size)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .raw().toBuffer();

  const destination = new URL(sampleDisplayPath(product, id), root);
  await mkdir(new URL(".", destination), { recursive: true });
  await sharp({ create: { width: sampleDisplaySize, height: sampleDisplaySize, channels: 4, background: "#0000" } })
    .composite([{ input: pixels, raw: { width: cropWidth, height: cropHeight, channels: 4 }, left, top }])
    .webp({ lossless: true })
    .toFile(fileURLToPath(destination));
}

const openingFrame = new URL(sampleDisplayPath("linen-doll", "front"), root);
for (const width of [384, 640, 750, 828, 1080, sampleDisplaySize]) {
  await sharp(fileURLToPath(openingFrame))
    .resize(width)
    .avif({ quality: 52, effort: 6 })
    .toFile(fileURLToPath(new URL(`front-${width}.avif`, openingFrame)));
}
