import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { measureSample } from "./sample-geometry.mjs";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const manifest = await readJson("../design/qa/original-rotation/generation.json");
const offsets = await readJson("../lib/client/sample-framing.json");
const viewOrder = ["front", "front-three-quarter", "right-profile", "back-right-three-quarter", "back", "back-left-three-quarter", "left-profile", "front-left-three-quarter"];
const seen = new Set();
const baselines = new Map();

assert.equal(manifest.assets.length, 24, "Expected eight studio views for each of three products");

for (const asset of manifest.assets) {
  const key = `${asset.product}:${asset.id}`;
  assert(!seen.has(key), `Duplicate sample: ${key}`);
  seen.add(key);
  const bytes = await readFile(new URL(`../${asset.output}`, import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.outputSha256, `Sample provenance changed: ${key}`);
  const source = await readFile(new URL(`../${asset.input}`, import.meta.url));
  assert.equal(createHash("sha256").update(source).digest("hex"), asset.inputSha256, `Original changed: ${key}`);
  const info = await measureSample(bytes, asset.product);
  assert.equal(info.width, info.height, `Sample must be square: ${key}`);
  const framing = offsets[asset.product]?.[viewOrder.indexOf(asset.id)];
  assert(framing && framing.scale > 0, `Missing display framing: ${key}`);
  const left = (info.bounds.left * framing.scale + framing.x) / info.width;
  const right = (info.bounds.right * framing.scale + framing.x) / info.width;
  const top = (info.bounds.top * framing.scale + framing.y) / info.height;
  const bottom = (info.bounds.bottom * framing.scale + framing.y) / info.height;
  const axis = (info.bodyAxisX * framing.scale + framing.x) / info.width;
  assert(Math.abs(axis - 0.5) <= 0.002, `Product center vertical axis drifts: ${key} (${axis})`);
  const baseline = baselines.get(asset.product) ?? bottom;
  baselines.set(asset.product, baseline);
  assert(Math.abs(bottom - baseline) <= 0.002, `Product floor contact drifts: ${key}`);
  assert(left >= 0.1 && top >= 0.1 && right <= 0.9 && bottom <= 0.9,
    `Product leaves the central 80% display box: ${key} (${[left, top, right, bottom].join(", ")})`);
}

for (const product of ["linen-doll", "ceramic-mug", "leather-handbag"]) {
  assert.equal(offsets[product].length, 8, `Expected eight framing records: ${product}`);
  for (const view of viewOrder) assert(seen.has(`${product}:${view}`), `Missing ${product}:${view}`);
}

console.log("Sample framing: all 24 studio views retain 10% margins, a centered body axis and a fixed floor contact.");
