---
name: reshoot_generate-rotation-images
description: Generate and verify Reshoot product-angle photographs from a source image, with a fixed camera and rotation around the product's center vertical axis. Use for creating or replacing sample rotation artwork.
---

# Generate Reshoot rotation images

Create individual catalog photographs of the same physical product turning on a centered turntable. Use the native image-generation tool for artwork; use Reshoot's generation prompt and measured sample registration as the maintained presentation contract.

Resolve the Reshoot checkout from this skill's location and verify its Git identity. Follow its current `AGENTS.md`. Read `lib/generation/request.ts`, `lib/client/sample-products.ts`, and the presentation contract in `docs/image-generation-evaluation.md`. When replacing samples, also read their current generation manifest and framing record under `design/qa/original-rotation/`.

## Establish the source and views

- Inspect the supplied original with `view_image` before editing. Preserve its original bytes and record its path and SHA-256. Establish which physical surface is the front and identify distinguishing details: silhouette, materials, seams, handles, hardware, markings, colors and relative component positions. Resolve an ambiguous front before assigning angle labels.
- Use that original as the sole visual reference for every view. Each generation is an independent edit of the original. Never feed an earlier generated view, clean sample, collage or screenshot back as another view's reference. Supporting original photos require the user's selection; label their roles explicitly if provided.
- Generate the requested subset. For a full sample rotation, use this order:

| Degrees | ID | Surface presented to the fixed camera |
| --- | --- | --- |
| 0 | front | Front |
| 45 | front-three-quarter | Front and right side |
| 90 | right-profile | Right side |
| 135 | back-right-three-quarter | Rear and right side |
| 180 | back | Rear |
| 225 | back-left-three-quarter | Rear and left side |
| 270 | left-profile | Left side |
| 315 | front-left-three-quarter | Front and left side |

RIGHT means the side at screen right in the front photograph. Positive view angles reveal that physical side first. These are view labels, not instructions to move the camera. Do not change the app's standard preset count merely because a sample has eight views.

## Generate each photograph

Use the current native image-generation edit interface, one call per view, and explicitly reference the original image only. When local reference paths are supported, pass the verified original path; otherwise re-display the original immediately before the edit and select only that reference. Do not let automatic recent-image selection include generated frames. Keep the background opaque white.

Use `buildGenerationPrompt` with the requested label, azimuth and `elevation: 0` as the base prompt. It contains the current identity, turntable, light and framing instructions. Add only source-specific construction facts and the following checks where needed:

- The entire product turns as one rigid object around its own vertical center axis at x = 50% of the canvas. Camera position, distance, elevation, focal length and framing stay fixed. No orbit, camera pan, tilt or zoom; no independently turning head, limbs, handles or panels. Never mirror an image to create another angle.
- Preserve the source product's proportions, pose relative to its body, materials, component count and visible text exactly. Infer unseen surfaces conservatively from observed construction; do not invent logos, pockets, seams or accessories. Describe inferred surfaces as estimates in provenance.
- Use the same square white studio, neutral 5500 K light above camera-left, gentle fill and soft floor shadow toward screen right. The lighting does not turn with the product.
- Keep a common product scale, centered body axis and fixed floor contact. Leave at least 10% clear product margin on each edge, including handles and other protrusions. Narrow side profiles retain their natural extra white space. Return one photograph, with no captions, arrows, contact sheet or added props.

Inspect every result against the original before accepting it. A different product, duplicate front, mirrored light, changing camera elevation or altered body pose is a failed view. Retry a failure with a specific correction while retaining the same original as reference. Recurring identity or geometry failures are a blocker to accepting the set; do not hide them with framing adjustments. Do not invoke the application's paid generation, credit accounting or secret-export path to produce illustrative artwork.

## Register and verify the set

1. Compare the complete ordered rotation and the 315-to-0 wrap. Track the main body's center, scale, floor contact, handle travel, visible surfaces and fixed studio light. An attractive contact sheet alone does not establish a stable rotation.
2. Register the true body axis, excluding moving protrusions and perspective panel seams. For the known samples, `scripts/sample-geometry.mjs` measures the doll torso, the mug base below its handle and the full handbag body below its handles. Its leather threshold excludes the brown floor shadow. Do not reuse these material thresholds or body bands blindly for another product: calibrate suitable body landmarks or a mask and inspect the result.
3. Apply only uniform display scaling and translation through `lib/client/sample-framing.json`. Normalize the same physical height and floor contact across views, not each view's width. Keep at least 10% margins. Do not stretch artwork, crop product parts or fake new angles with CSS rotation. Registration cannot repair a wrong viewpoint or changed product shape.
4. For replacements, update the existing generation manifest with each exact prompt, original/output paths and SHA-256 values, selected generation artifact and any rejected attempts. Retain historical evidence. Update the framing record with freshly measured bounds, body axis and offsets. If adding a product, update the consuming imports, view counts and verification expectations together.
5. Run the relevant sample framing check, lint, type check, tests and build. The sample check must remeasure the current images, preserve source/output provenance, enforce 10% margins, and hold body axes at x = 50% and floor contact within 0.2% of canvas size. Prompt wording alone is not output verification.
6. Inspect the running carousel in Brave's Agents profile using the bundled Browser runtime with explicit Brave selection. Confirm each expected image is loaded and visible before recording it. Capture all angles on desktop and phone; let scroll animation settle before comparing screenshots. Remeasure the body axis and base from rendered screenshots, accounting for screenshot/CSS scale and viewer position. For the known bag, the demonstrated acceptance threshold is no more than 2 CSS px of axis or base spread. Investigate a failure instead of widening the threshold to pass it. Check playback, product transitions and the wrap.

Keep selected assets and provenance in the repository; keep temporary/rejected outputs outside public assets. Update existing authoritative docs and `design-qa.md` with observations and limits. Report accepted views, saved paths and any inferred surfaces or failed checks. Asset generation does not itself authorize publishing: when deployment is requested, follow the existing production workflow and repeat rotation verification on the exact READY commit at the live domain.
