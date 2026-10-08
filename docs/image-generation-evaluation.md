# Product photo model evaluation — 2026-10-07

Reshoot turns a simple original product image into separate catalog views with a consistent white studio setting. Product identity, pose, construction, markings, and correct camera angles take priority over creative styling.

## Decision

Use `openai/gpt-image-2.5-flare` by default, with `openai/gpt-image-2.5-sunburst` available through the server-only `RESHOOT_IMAGE_MODEL` environment variable. An unsupported override fails configuration rather than silently selecting another provider. A claimed attempt retains its recorded model and endpoint across configuration changes. There is no automatic paid model fallback.

Flare gave the more convincing right profile of the knitted doll with the revised prompt. Sunburst's right-profile result showed more of the far arm and both feet, drifting toward a three-quarter view. Both models preserved the visible bow, braids, knitted material and seated posture, although synthesized views changed some limb spacing and proportions. Both reproduced `RESHOOT`, `CREME SOAP`, and `100 g` correctly on the packaging fixture. Neither model demonstrated perfect geometric reconstruction from one image.

This is a small visual pilot, not a measured population-level quality or reliability ranking. There were no repeated seeds or runs per condition. The packaging reference is a deterministic illustration, not a photographic product. Sunburst produced sharper-looking, larger product framing in this pilot; Flare's angle adherence mattered more for the product's intended multi-angle workflow. The revised prompt makes requirements explicit, but these samples do not establish a universal improvement over the old prompt.

## Method and observations

Both models used the same normalized originals and request parameters: one output, square aspect ratio, high quality, opaque background, and one WebP reference. The doll reference uses the app's 1536-pixel bounding box and WebP quality 90 normalization. Each call returned one 1024 × 1024 PNG. No retries or model fallback were performed.

Baseline: doll right profile and carton front per model. Revised prompt: the same two cases plus doll front per model. Two requests ran concurrently; elapsed times are observations under this concurrency, not controlled latency benchmarks.

| Model | Prompt | Images succeeded | Mean response time | Total reported cost |
| --- | --- | --- | --- | --- |
| Sunburst | Previous | 2/2 | 31.0 s | $0.123029 |
| Flare | Previous | 2/2 | 27.8 s | $0.123029 |
| Sunburst | Revised | 3/3 | 33.5 s | $0.190216 |
| Flare | Revised | 3/3 | 40.0 s | $0.190216 |

All ten requests succeeded, costing $0.626490 in provider-reported usage. The models had identical costs per matching case. Flare was not consistently faster in this pilot; the default choice is based on visual camera adherence. This comparison does not mint or consume workspace credits because it is a separate development evaluation.

## Prompt changes

- Define front, right, left, back and camera elevation explicitly; keep the product fixed while the camera moves.
- Preserve physical pose, component count, seams, wear, materials, original colors and proportions.
- Preserve product packaging and existing lettering. The old instruction banned packaging/text indiscriminately.
- Make the first original the identity anchor; use supporting originals as evidence for hidden surfaces.
- Keep a common studio sweep, white balance, soft lighting, contact shadow and framing across the set.
- Infer unseen surfaces conservatively, without inventing decorations, labels or accessories.
- Keep optional creative styling subordinate to product identity and the requested camera view.

A single image cannot verify the back or hidden construction of a real product. For accurate sales photos of those surfaces, supply supporting originals and inspect the generated set before approving it.

## App workflow verification

The local testing workspace generated a four-shot Flare batch (front, front-right three-quarter, right profile, back), using one original and the revised prompt. All four private 1024 × 1024 outputs persisted. The workspace finished with 840 available fake credits, zero held credits, and 160 captured credits.

A validation build ran while this batch was active and erased the Workflow adapter's default `.next/workflow-data` run store, producing “step not found” errors. The four already stored outputs were recovered through the existing idempotent credit-capture path without additional image calls. Future Infisical-backed local launches now put Workflow state under `.workflow-local/`, separately for each dev instance and local start/build modes. Automated verification checks this location is outside build output. Existing running servers retain their launch configuration until their next normal start; none were stopped or restarted for this repair.

Provider usage metadata is now stored before raster persistence, so future output recovery can retain billing evidence. Reported cost for the interrupted four-shot app batch was not recovered; the $0.626490 total above covers only the ten comparison requests. The app test involved four additional image requests.

## Reproduce explicitly

The comparison makes paid provider calls. It is never part of startup, build, or the automated test suite. Credentials are fetched through the pinned development Infisical project into memory.

```bash
python3 scripts/infisical/compare_images.py --phase baseline --output-dir /absolute/path/to/evaluation
python3 scripts/infisical/compare_images.py --phase candidate --output-dir /absolute/path/to/evaluation
```

Use `--model openai/gpt-image-2.5-flare` or `--model openai/gpt-image-2.5-sunburst` to limit a phase to one model. Baseline makes at most four requests; candidate at most six. A JSON record is written before dispatch; rerunning the same directory skips recorded calls, including ambiguous or interrupted calls, to avoid duplicate charges. Use a new directory only when intentionally requesting a new evaluation. Records retain the exact prompt, parameters, reference filename, duration, status, usage cost and output dimensions, without credentials or signed private storage URLs.

Model capabilities and request format were checked against [OpenRouter image generation documentation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation), [Sunburst](https://openrouter.ai/openai/gpt-image-2.5-sunburst), [Flare](https://openrouter.ai/openai/gpt-image-2.5-flare), and the provider's live image model catalog. No unsupported output-size or output-format option was added.
