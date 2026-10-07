// Explicit evaluation command; never called by development startup or the test suite.
import { parseArgs } from "node:util";
import { resolve, isAbsolute } from "node:path";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import sharp from "sharp";
import { buildImageRequest } from "../lib/generation/request.ts";

const { values } = parseArgs({ options: {
  phase: { type: "string" },
  "output-dir": { type: "string" },
  model: { type: "string" },
} });
if (!["baseline", "candidate"].includes(values.phase) || !isAbsolute(values["output-dir"] ?? "")) {
  throw new Error("Use --phase baseline|candidate --output-dir /absolute/path. Each phase makes at most six paid image requests.");
}
const models = ["openai/gpt-image-2.5-sunburst", "openai/gpt-image-2.5-flare"];
if (values.model && !models.includes(values.model)) throw new Error("Choose one of the two comparison models.");
const key = process.env.OPENROUTER_API_KEY;
if (!key) throw new Error("Managed image-provider credentials are required.");
const directory = resolve(values["output-dir"]);
await mkdir(directory, { recursive: true });
const doll = await sharp(await readFile("public/assets/sample-doll.png")).rotate()
  .resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true })
  .webp({ quality: 90 }).toBuffer();
// Deterministic illustrated packaging fixture: spelling, color, shape and component
// preservation can be assessed without transmitting another person's product photo.
const cartonSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<rect width="1024" height="1024" fill="#eee9dd"/><ellipse cx="512" cy="831" rx="198" ry="22" fill="#cec8bb"/>
<rect x="332" y="203" width="360" height="620" rx="5" fill="#c79c64" stroke="#81603b" stroke-width="3"/>
<rect x="375" y="310" width="274" height="345" rx="3" fill="#f7f4ea"/>
<text x="512" y="401" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#234f48">RESHOOT</text>
<path d="M470 442 L554 442 L554 456 L470 456 Z" fill="#234f48"/>
<text x="512" y="514" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#234f48">CREME SOAP</text>
<text x="512" y="562" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#234f48">100 g</text>
<path d="M352 223 L672 223" stroke="#9c774d" stroke-width="3"/></svg>`;
const carton = await sharp(Buffer.from(cartonSvg)).webp({ quality: 90 }).toBuffer();
await Promise.all([
  writeFile(resolve(directory, "reference-doll.webp"), doll),
  writeFile(resolve(directory, "reference-carton.webp"), carton),
]);
const cases = [
  { id: "doll-right-profile", reference: doll, shot: { label: "Right profile", azimuth: 90, elevation: 0 } },
  { id: "carton-front", reference: carton, shot: { label: "Front", azimuth: 0, elevation: 0 } },
  ...(values.phase === "candidate" ? [{ id: "doll-front", reference: doll, shot: { label: "Front", azimuth: 0, elevation: 0 } }] : []),
];
function legacyPrompt(shot) {
  return [
    "Create exactly one premium studio product photograph.", `SHOT: ${shot.label}.`,
    `CAMERA AZIMUTH: ${shot.azimuth} degrees.`, `CAMERA ELEVATION: ${shot.elevation} degrees.`,
    "REFERENCE 1 is the primary original and authoritative identity anchor.",
    "Preserve exact product identity, materials, construction, colors, proportions, details, imperfections and wear.",
    "Use a seamless, evenly lit, pure white background extending edge-to-edge, with only a small natural contact shadow.",
    "Do not add text, props, hands, people, packaging, duplicate products or a contact sheet.", "Return only one image.",
  ].join("\n");
}
const tasks = (values.model ? [values.model] : models).flatMap((model) => cases.map((testCase) => ({ model, testCase })));
let next = 0;
async function run() {
  while (next < tasks.length) {
    const { model, testCase } = tasks[next++];
    const name = `${values.phase}-${model.split("/")[1]}-${testCase.id}`;
    const recordPath = resolve(directory, `${name}.json`);
    try { await access(recordPath); console.log(`Skipped recorded request: ${name}`); continue; } catch {}
    const request = buildImageRequest({ model, shot: testCase.shot, referenceImages: [`data:image/webp;base64,${testCase.reference.toString("base64")}`] });
    if (values.phase === "baseline") request.prompt = legacyPrompt(testCase.shot);
    const startedAt = new Date().toISOString();
    const start = performance.now();
    // Record before dispatch: a crash/timeout must never replay a potentially paid call.
    const record = { model, case: testCase.id, phase: values.phase, startedAt, state: "started", prompt: request.prompt,
      parameters: { n: request.n, aspect_ratio: request.aspect_ratio, quality: request.quality, background: request.background }, reference: testCase.id.startsWith("doll") ? "reference-doll.webp" : "reference-carton.webp" };
    await writeFile(recordPath, JSON.stringify(record, null, 2), { flag: "wx" });
    console.log(`Started ${name}`);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/images", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://reshoot.tsilva.eu", "X-OpenRouter-Title": "Reshoot model comparison" },
        body: JSON.stringify(request), signal: AbortSignal.timeout(280_000),
      });
      record.durationSeconds = Math.round((performance.now() - start) / 100) / 10;
      record.httpStatus = response.status;
      const result = await response.json();
      record.costUsd = Number.isFinite(Number(result.usage?.cost)) ? Number(result.usage.cost) : null;
      const encoded = result.data?.[0]?.b64_json;
      if (!response.ok || !encoded) {
        record.state = "failed";
        record.errorCode = result.error?.code ?? "no_image";
      } else {
        const output = Buffer.from(encoded, "base64");
        const metadata = await sharp(output).metadata();
        const extension = { png: "png", jpeg: "jpg", webp: "webp" }[metadata.format];
        if (!extension) throw new Error("Unsupported generated image.");
        record.image = `${name}.${extension}`;
        record.width = metadata.width;
        record.height = metadata.height;
        record.state = "succeeded";
        await writeFile(resolve(directory, record.image), output);
      }
    } catch (error) {
      record.state = "ambiguous";
      record.errorCode = error.name;
      record.durationSeconds = Math.round((performance.now() - start) / 100) / 10;
    }
    await writeFile(recordPath, JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ name, state: record.state, status: record.httpStatus, seconds: record.durationSeconds, costUsd: record.costUsd, dimensions: record.width ? `${record.width}x${record.height}` : null, errorCode: record.errorCode }));
  }
}
await Promise.all([run(), run()]);
