import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const manifest = await readJson("../design/qa/original-rotation/generation.json");
const offsets = await readJson("../lib/client/sample-framing.json");
const viewOrder = ["front", "front-three-quarter", "right-profile", "back-right-three-quarter", "back", "back-left-three-quarter", "left-profile", "front-left-three-quarter"];
const seen = new Set();

assert.equal(manifest.assets.length, 24, "Expected eight studio views for each of three products");

for (const asset of manifest.assets) {
  const key = `${asset.product}:${asset.id}`;
  assert(!seen.has(key), `Duplicate sample: ${key}`);
  seen.add(key);
  const bytes = await readFile(new URL(`../${asset.output}`, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.outputSha256, `Sample provenance changed: ${key}`);
  const source = await readFile(new URL(`../${asset.input}`, import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), asset.inputSha256, `Original changed: ${key}`);
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, info.height, `Sample must be square: ${key}`);
  const rows = new Uint32Array(info.height);
  const columns = new Uint32Array(info.width);

  // Colored material separates these known samples from white backgrounds and
  // neutral-gray floor shadows; this is not a mask for arbitrary user uploads.
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * info.channels;
      const low = Math.min(data[index], data[index + 1], data[index + 2]);
      const high = Math.max(data[index], data[index + 1], data[index + 2]);
      if (high - low > 15 && low < 240) {
        rows[y] += 1;
        columns[x] += 1;
      }
    }
  }

  const occupiedRows = Array.from(rows.keys()).filter((y) => rows[y] >= Math.max(3, info.width * 0.003));
  const occupiedColumns = Array.from(columns.keys()).filter((x) => columns[x] >= Math.max(3, info.height * 0.003));
  assert(occupiedRows.length && occupiedColumns.length, `Product silhouette missing: ${key}`);
  const framing = offsets[asset.product]?.[viewOrder.indexOf(asset.id)];
  assert(framing && framing.scale > 0, `Missing display framing: ${key}`);
  const left = (Math.min(...occupiedColumns) * framing.scale + framing.x) / info.width;
  const right = (Math.max(...occupiedColumns) * framing.scale + framing.x) / info.width;
  const top = (Math.min(...occupiedRows) * framing.scale + framing.y) / info.height;
  const bottom = (Math.max(...occupiedRows) * framing.scale + framing.y) / info.height;
  assert(left >= 0.1 && top >= 0.1 && right <= 0.9 && bottom <= 0.9,
    `Product leaves the central 80% display box: ${key} (${[left, top, right, bottom].join(", ")})`);
}

for (const product of ["linen-doll", "ceramic-mug", "leather-handbag"]) {
  assert.equal(offsets[product].length, 8, `Expected eight framing records: ${product}`);
  for (const view of viewOrder) assert(seen.has(`${product}:${view}`), `Missing ${product}:${view}`);
}

console.log("Sample framing: all 24 studio views retain at least 10% measured product margins.");
