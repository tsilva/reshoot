---
name: reshoot_generate-rotation-images
description: Generate and verify Reshoot product-angle photographs from a source image, with a fixed camera and rotation around the product's center vertical axis. Use for creating or replacing sample rotation artwork.
---

# Generate Reshoot rotation images

Create views of the same physical product turning on a centered turntable. A convincing rotation requires consistent geometry as well as position. Use the native image-generation tool for bitmap preparation or editing; use one shared 3D reconstruction or an actual photographed turntable sequence when the result must rotate rigidly.

The 2026-10-30 bag review exposed a failed acceptance check: all eight independent AI views could have centered silhouettes and aligned bases while body dimensions, handle proportions and perspective still changed. Do not repeat that certification. A small measured center spread proves registration only.

Resolve the Reshoot checkout from this skill's location and verify its Git identity. Follow its current `AGENTS.md`. Read `lib/generation/request.ts`, `lib/client/sample-products.ts`, and the presentation contract in `docs/image-generation-evaluation.md`. When replacing samples, also read their current generation manifest and framing record under `design/qa/original-rotation/`.

## Establish the source and views

- Inspect the supplied original with `view_image` before editing. Preserve its original bytes and record its path and SHA-256. Establish which physical surface is the front and identify distinguishing details: silhouette, materials, seams, handles, hardware, markings, colors and relative component positions. Resolve an ambiguous front before assigning angle labels.
- Keep that original authoritative for identity. For a rigid turntable, derive one shared reconstruction from it and render every angle from that same asset. A coordinated layout or generated view can be a derived geometry aid, but must be recorded as such and must not silently replace the original as identity evidence. Do not chain successive generated views as new identity references. Supporting original photographs require the user's selection; label all input roles.
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

## Establish consistent geometry first

For a rotating demonstration, use a supplied 3D asset, one image-to-3D reconstruction, or a genuine fixed-camera photographic turntable sequence. Preserve the original source and any prepared foreground cutout; record preparation prompts, file hashes, reconstruction method/version, seed and exported asset hash. An inferred rear is an estimate, not measured product truth.

For a reconstructed asset, center the physical body once, put its ground pivot on the floor, and choose one camera, projection, focal length, scale and lighting rig. Rotate only the object around that vertical pivot. Keep mesh vertex positions, materials, handle attachment points, camera and lights unchanged between frames. Save the rig and exact yaw angles so the sequence can be reproduced. Do not normalize the width, height or crop independently at each angle.

Inspect the reconstruction before rendering the set: original-facing silhouette, body width/height/depth, two handles, arch shape, attachment heights, flap, hardware and seams. A rigid mesh can still reconstruct the wrong bag. Reject missing/fused handles, altered construction or unacceptable identity drift. Use the original as the comparison, not a previously generated approximation.

Native image generation may produce a candidate multiview layout or individual catalog photographs. These are proposals, not proof of a common 3D object. If their geometry does not agree, keep them out of the accepted turntable. Repeated prompt refinement and CSS registration do not establish rigidity.

## Prepare bitmap artwork when needed

Use the current native image-generation edit interface for source cutouts, material preparation or catalog-view candidates. Pass the original explicitly, plus any deliberately selected derived geometry guide with its role identified. Do not let automatic recent-image selection include unintended generated frames. Keep catalog backgrounds opaque white; request real alpha for a reconstruction cutout and preserve the product's geometry during extraction.

Use `buildGenerationPrompt` with the requested label, azimuth and `elevation: 0` as the base prompt. It contains the current identity, turntable, light and framing instructions. Add only source-specific construction facts and the following checks where needed:

- The entire product turns as one rigid object around its own vertical center axis at x = 50% of the canvas. Camera position, distance, elevation, focal length and framing stay fixed. No orbit, camera pan, tilt or zoom; no independently turning head, limbs, handles or panels. Never mirror an image to create another angle.
- Preserve the source product's proportions, pose relative to its body, materials, component count and visible text exactly. Infer unseen surfaces conservatively from observed construction; do not invent logos, pockets, seams or accessories. Describe inferred surfaces as estimates in provenance.
- Use the same square white studio, neutral 5500 K light above camera-left, gentle fill and soft floor shadow toward screen right. The lighting does not turn with the product.
- Keep a common product scale, centered body axis and fixed floor contact. Leave at least 10% clear product margin on each edge, including handles and other protrusions. Narrow side profiles retain their natural extra white space. Return one photograph, with no captions, arrows, contact sheet or added props.

Inspect every result against the original before accepting it. A different product, duplicate front, mirrored light, changing camera elevation or altered body pose is a failed view. Retry a failure with a specific correction while retaining the original as identity evidence. Recurring identity or geometry failures are a blocker to accepting the set; do not hide them with framing adjustments. Do not invoke the application's paid generation, credit accounting or secret-export path to produce illustrative artwork.

## Register and verify the set

1. Compare the complete ordered rotation and the 315-to-0 wrap, including the two adjacent rear views that exposed the bag failure. Track the upper body rim, body height, handle rise and arch shape, handle attachment spacing, side depth, flap dimensions, seams, perspective and texture scale. Width foreshortening is expected; changing physical proportions is not. For rendered sets, verify the same mesh/material hashes and fixed camera/light rig, with yaw as the only per-frame object-transform change. A contact sheet, center-spread measurement or common bounding-box height alone does not establish a stable rotation.
2. Register the true body axis, excluding moving protrusions and perspective panel seams. For the known samples, `scripts/sample-geometry.mjs` measures the doll torso, the mug base below its handle and the full handbag body below its handles. Its leather threshold excludes the brown floor shadow. Do not reuse these material thresholds or body bands blindly for another product: calibrate suitable body landmarks or a mask and inspect the result.
3. A shared render should already have one common frame, scale and pivot; use identical display registration across those views. Keep at least 10% margins over the full rotation envelope. For legacy independent photographs, only uniform scaling/translation is allowed, and registration must be described as registration. Do not stretch artwork, crop product parts, force every silhouette midpoint onto the pivot or fake new angles with CSS rotation. A real perspective footprint may change around a fixed 3D ground pivot. Registration cannot repair a wrong viewpoint or changed product shape.
4. For replacements, update the existing generation manifest with each exact prompt, original/output paths and SHA-256 values, selected generation artifact and any rejected attempts. Retain historical evidence. Update the framing record with freshly measured bounds, body axis and offsets. If adding a product, update the consuming imports, view counts and verification expectations together.
5. Run the relevant sample framing check, lint, type check, tests and build. Preserve source/output provenance and 10% margins. For shared renders, check the recorded projected rotation pivot and common registration; for legacy samples, retain the existing body-center/floor measurements but report their limited scope. Add meaningful geometry/rig validation for new rendered sets. Prompt wording and a green framing test are not output-quality verification.
6. Inspect the running carousel in Brave's Agents profile using the bundled Browser runtime with explicit Brave selection. Confirm each expected image is loaded and visible before recording it. Capture all angles on desktop and phone; let scroll animation settle before comparing screenshots. Remeasure registration relative to the viewer and inspect actual adjacent-frame geometry during playback. The old bag met a 2 CSS px center/base-spread threshold and still failed visual rigidity; never use that threshold as the whole acceptance gate. Check playback, product transitions and the wrap, and record geometry and registration verdicts separately.

Keep selected assets and provenance in the repository; keep temporary/rejected outputs outside public assets. Update existing authoritative docs and `design-qa.md` with observations and limits. Report accepted views, saved paths and any inferred surfaces or failed checks. Asset generation does not itself authorize publishing: when deployment is requested, follow the existing production workflow and repeat rotation verification on the exact READY commit at the live domain.
