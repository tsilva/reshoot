# Product photo model selection and evaluation

Reshoot turns a simple original product image into separate catalog views with transparent backgrounds shown on the studio’s white surface. Product identity, pose, construction, markings, and correct camera angles take priority over creative styling.

## Decision

New generation attempts use only `openai/gpt-image-2.6-sunburst`. There is no 2.5 or Flare fallback. The server-only `RESHOOT_IMAGE_MODEL` setting may be absent or name 2.6 Sunburst; any other value fails configuration. Remove or update an older override before building or starting the app. A previously claimed attempt retains its recorded model and uses the configured local or hosted provider route, preserving dispatch recovery and cost provenance.

The [2.6 Sunburst endpoint catalog](https://openrouter.ai/api/v1/images/models/openai/gpt-image-2.6-sunburst/endpoints), checked on 2026-11-06, supports the existing square aspect ratio, high quality, transparent background and up to 16 reference images. Requests explicitly set `quality: "high"` and send `provider.options.openai.complexity: "high"`, using the [OpenRouter provider-specific option format](https://openrouter.ai/blog/announcements/image-api/). Credit accounting is unchanged. This selection has automated request/dispatch coverage; no live 2.6 quality, latency or cost comparison has been run.

Keep this Sunburst/high-complexity/high-quality configuration fixed while establishing the product-photography baseline. Assess product identity, requested orientation, markings, transparency, latency and actual recorded provider cost on representative shoots. Lower quality, lower complexity or a switch to Flare is deferred until the user is satisfied with the baseline; no automatic downgrade is enabled.

## Historical 2.5 pilot — 2026-10-07

Flare gave the more convincing right profile of the knitted doll with the revised prompt. Sunburst's right-profile result showed more of the far arm and both feet, drifting toward a three-quarter view. Both models preserved the visible bow, braids, knitted material and seated posture, although synthesized views changed some limb spacing and proportions. Both reproduced `RESHOOT`, `CREME SOAP`, and `100 g` correctly on the packaging fixture. Neither model demonstrated perfect geometric reconstruction from one image.

This is a small visual pilot, not a measured population-level quality or reliability ranking. There were no repeated seeds or runs per condition. The packaging reference is a deterministic illustration, not a photographic product. Sunburst produced sharper-looking, larger product framing in this pilot; Flare's angle adherence mattered more for the product's intended multi-angle workflow. The revised prompt makes requirements explicit, but these samples do not establish a universal improvement over the old prompt.

## Studio presentation defaults

`CATALOG_STUDIO_INSTRUCTIONS` in `lib/generation/request.ts` supplies the shared presentation instructions for new app generation requests and can be reused in isolated image-generation experiments:

- Square transparent canvas. The area outside the product and visible gaps between its parts have zero alpha. The generated image excludes the studio floor and cast shadow. The app’s white viewing surface shows through the transparent areas.
- One large diffused key light approximately 45 degrees to camera-left and 45 degrees above the camera, neutral 5500 K daylight, and gentle fill. Light direction stays fixed relative to the image across views.
- The complete product silhouette, including extremities, handles and packaging, stays inside x = 10–90% and y = 10–90% of the image. This leaves a minimum 10% clear margin on every side.
- Aim for 80% occupancy along the longest dimension of the widest or tallest view. Keep one scale, central body axis and contact-point placement across the set rather than zooming or recentering each silhouette independently. Narrower views can have larger margins.
- Rotate the whole product around its own vertical center axis at x = 50%, with a fixed floor contact. Lock the camera position, distance, elevation, focal length and framing; keep the studio lights fixed. Standard presets all use level elevation, including the three-quarter view.
- Optional styling is subordinate to product identity, camera direction, studio lighting, background and margins.

Local generation through AgentBridge and hosted generation through OpenRouter both send `background: "transparent"`. Both configured models advertise that option. The worker checks for fully transparent and visible pixels before saving a new output. If the provider returns an opaque or blank result, it releases the held credits and records the provider response without another request. Original downloads and resized WebP previews retain alpha. The alpha check does not measure arbitrary product geometry or validate the shape of the cutout. Previously saved results and recoverable attempts keep their original bytes.

All three home-page samples now use an original-first, orientation-guided photographic workflow. Every final image is generated by the native image tool with Image 1 as the authoritative original and Image 2 as a textureless pose hint. The hint supplies direction and occlusion; product identity, construction, proportions, fine material detail and photographic quality come from the original. Direct photographs of textured proxy meshes were rejected by the user on 2026-10-31 and are not selected. The doll hint uses a source-derived Hunyuan3D-2.1 shape; the mug uses an approximate round cup/loop scaffold after a tilted inferred rim gave misleading elevation cues. All hint sets rotate only their proxy about a centered vertical ground axis, with one fixed orthographic camera at 8 degrees. This sample-only elevation does not change the application's standard presets.

Provenance paths are relative to the repository root. Optional transient exports
and generator outputs are `null` when no byte-identical versioned copy is retained.
Retained source/guide paths, generation parameters, and content hashes remain
authoritative; a missing original is never replaced with a different artifact.

The exact [photographic prompts and original/guide roles](../design/qa/orientation-guided-rotation/photographs.json), proxy source/parameters, input hashes, neutral captures and guide rigs are under `design/qa/orientation-guided-rotation/`. Source/output provenance, measured body-axis/floor registration and minimum 10% margins are checked for all 24 displayed photos. All 24 new photos also verify hint hashes and their capture rigs. These guide checks do not certify output geometry or photographic quality: actual directions, occlusions, proportions, material detail, neighboring views and the wrap require visual review. The bag was regenerated with a textureless trapezoidal body/two-handle scaffold to address the earlier dimension drift; the original supplies its leather, stitching and front hardware. Historical pre-change [generation](../design/qa/orientation-guided-rotation/generation-before-2026-10-31.json) and [framing](../design/qa/orientation-guided-rotation/framing-before-2026-10-31.json) records are retained.

The 2026-10-30 user review rejected the bag's visual rigidity despite these passing registration measurements. Independently generated views change apparent body dimensions, handle proportions and perspective. Registration tests must not be presented as geometric reconstruction or natural-rotation acceptance. Replacement artwork must pass a separate identity/geometry review; shared geometry and a fixed render rig, or a real turntable capture, provide a coherent basis for that review. Use the [sample rotation review](testing.md#sample-rotation-review) to check geometry and playback separately from registration.

The 2026-11-03 ceramic mug set uses the eight selected native-generated RGBA PNGs. The carousel supplies the white background, and the art contains no baked studio shadow. The same source and angle hints were used as for the earlier JPEGs. Framing excludes transparent pixels and registers the mug to its previous displayed body height and floor anchor. The opaque comparison files are retained, with the previous selection recorded at commit `6fff0e7`.

The remaining sample sets were regenerated as transparent cutouts on 2026-11-03. The doll and handbag are served as lossless WebP with their original alpha and visible RGB values. The approved mug PNGs remain the third transparent set. All three use the carousel’s white viewing surface.

## Upright rotation in user generation

New studio shoots request eight level views at 45° intervals, starting at the front and proceeding through the right profile, back, and left profile. One confirmed quote covers all eight jobs, each with the same set of frozen originals and its own orientation guide.

The prompt places every product on its natural base with its up direction vertical. It preserves construction, proportions and photographic detail from the originals while discarding source camera tilt and lean. Every standard view changes yaw only. Rear-quarter directions explicitly show the back and the corresponding side, with the front face hidden.

Every object uses the same annotated direction frame: dark front, light rear, orange physical right and blue physical left. Its dimensions and silhouette are explicitly not object geometry. No title classification or category-specific scaffold selects the pose. The originals alone determine construction, proportions, materials, openings, protrusions, component attachments and natural display orientation. All guides honor the requested camera elevation; standard presets are level. Known legacy preset keys can supply a missing azimuth. Label-only shots without a known direction use text without an invented angle.

Every oriented request names the same physical coordinate frame and complete eight-angle sequence. Physical sides are defined from a straight-on front view and never renamed relative to the rear image. Opposite profiles expose opposite physical sides; rear quarters hide front-facing features. For curved, open and irregular objects these terms describe presentation hemispheres and near/far occlusion, not mandatory flat faces. Objects without an identifiable front use the primary-reference-facing direction as their canonical front. Genuine rotational symmetry may produce visually equivalent views; the model must not invent distinguishing details.

New quotes whose shots all have known orientations freeze `verified-rotation-v1`, regardless of object title or category. After raster/transparency checks, each candidate is independently reviewed with `openai/gpt-4.1-mini` using the same ordered originals, direction frame and candidate bytes. No signed URLs or account details enter the prompt. The reviewer reports observed front/rear exposure, physical side, identity, rigid pose, confidence and landmark evidence. Code compares those observations with the requested orientation. Demonstrated rotational symmetry may make an entire target pose visually equivalent; unavailable evidence must instead be uncertain. Wrong-side, changed-construction, uncertain, malformed and unavailable reviews reject the candidate before storage or credit capture, release held credits and never retry automatically.

Legacy quote identifiers remain readable for historical outputs and exports, but never select category-specific generation prompts or guides. Unfinished legacy jobs also use the common direction frame; old quotes without the review policy retain their acceptance contract. Existing completed projects and their stored files are not rewritten. New quotes do not select a category-specific export projection.

The extra vision request adds provider cost and latency, recorded separately as `rotation_review`, once per image attempt. Customer quote amounts are unchanged. Apply `0006_rotation_review` before deploying this path. A reviewer is fallible, and individual acceptance does not establish identical geometry across the set or reconstruct unseen surfaces. Review the complete ordered photographic sequence, especially opposite profiles, opposite quarters, rear transitions and the wrap, before claiming visual success. Rejections can leave a partial shoot rather than a complete rotation.

The direction frame is created before the guarded transition that starts a provider request, with no reconstruction service or paid preprocessing call. Original reference counts, frozen input order, credit holds and recovery remain unchanged. Each image request and each review have independent durable duplicate-call protection. Five originals plus the frame require six image inputs; the review receives those six plus the candidate. Model input limits and actual photographic/reviewer performance require separate verification.

Tests cover category-independent request construction, all eight direction rasters and opposite-side colors, exact custom angles/elevations, original/guide roles, legacy identifier normalization, symmetry/uncertainty, and durable worker acceptance/rejection before storage and credit capture. Synthetic tests establish enforcement, not real model accuracy or coherent photographic geometry.

## Capture sample-specific textureless orientation hints

This local utility produces guide images only. It does not generate final product photographs, use application credits, or add Three.js to the website's runtime dependencies. Prepare a fresh tool directory, then open the printed loopback URL in the configured test browser:

```sh
orientation_tools_dir="$(mktemp -d)"
python3 scripts/sample-orientation-guides/serve.py --prepare-dependencies "$orientation_tools_dir"
pnpm --dir "$orientation_tools_dir" install --frozen-lockfile --ignore-scripts
python3 scripts/sample-orientation-guides/serve.py --dependencies-dir "$orientation_tools_dir/node_modules" --output-dir "$orientation_tools_dir/guides"
```

Select Mug, Doll or Bag and **Capture eight guides**. The utility writes eight neutral-gray, textureless PNGs without cast shadows and a guide-only rig with source/output hashes. Three.js 0.182.0 is pinned in a separate hardened dependency fixture. Use the original photograph first and the corresponding guide second in native image generation. Build the studio prompt with `buildGenerationPrompt(shot, 1)` so the guide is not mislabeled as a supporting original, then explicitly add its orientation-only role. Match the prompt elevation to the hint camera. A typical instruction is: “Rotate the product in Image 1 to the orientation of Image 2; retain the original’s photographic materials and details. Image 2 is an approximate textureless pose hint, not final artwork.” Check a discriminating profile before generating the complete set.

Photographic registration uses uniform scale and translation only. Each product has a common displayed height and floor anchor, with enough room for the entire handle/limb sweep around the centered body axis. Profiles retain natural whitespace; no photo is stretched to fit a proxy. Registration is not a geometry acceptance test. Hidden construction and surface details remain conservative single-image estimates.

## Method and observations

Both models used the same normalized originals and request parameters: one output, square aspect ratio, high quality, opaque background, and one WebP reference. The doll reference uses the app's 1536-pixel bounding box and WebP quality 90 normalization. Each call returned one 1024 × 1024 PNG. No retries or model fallback were performed.

Baseline: doll right profile and carton front per model. Revised prompt: the same two cases plus doll front per model. Two requests ran concurrently; elapsed times are observations under this concurrency, not controlled latency benchmarks.

| Model | Prompt | Images succeeded | Mean response time | Total reported cost |
| --- | --- | --- | --- | --- |
| Sunburst | Previous | 2/2 | 31.0 s | $0.123029 |
| Flare | Previous | 2/2 | 27.8 s | $0.123029 |
| Sunburst | Revised | 3/3 | 33.5 s | $0.190216 |
| Flare | Revised | 3/3 | 40.0 s | $0.190216 |

All ten requests succeeded, costing $0.626490 in provider-reported usage. The models had identical costs per matching case. Flare was not consistently faster in this pilot; the original 2.5 default choice was based on visual camera adherence. This comparison does not mint or consume workspace credits because it is a separate development evaluation.

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

## Explicit evaluation

`scripts/compare-image-models.mjs` now accepts only `openai/gpt-image-2.6-sunburst`. It compares the previous and revised prompts, rather than reproducing the historical 2.5 model comparison above. It makes real provider calls and is never part of startup, build, or the automated test suite.

Agent-operated execution requires a separately reviewed sandboxed provider route and approval of the complete prompts, reference images and request count. Do not use the legacy secret-injection launcher. A protected launcher's source pins need trusted review after comparison-source changes.

The script requires `--phase baseline` or `--phase candidate` and an absolute `--output-dir`; the optional `--model` accepts only 2.6 Sunburst. Baseline makes at most two requests; candidate at most three. A JSON record is written before dispatch; rerunning the same directory skips recorded calls, including ambiguous or interrupted calls, to avoid duplicate charges. Use a new directory only when intentionally requesting a new evaluation. Records retain the exact prompt, parameters, reference filename, duration, status, usage cost and output dimensions, without credentials or signed private storage URLs.

For the historical 2.5 pilot, model capabilities and request format were checked against [OpenRouter image generation documentation](https://openrouter.ai/docs/guides/overview/multimodal/image-generation), [Sunburst](https://openrouter.ai/openai/gpt-image-2.5-sunburst), [Flare](https://openrouter.ai/openai/gpt-image-2.5-flare), and the provider's live image model catalog. No unsupported output-size or output-format option was added.
