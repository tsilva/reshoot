---
name: reshoot_generate-rotation-images
description: Generate photographic Reshoot rotations from original detail and textureless orientation hints, then verify the actual rotations on the live site after authorized deployment.
---

# Generate Reshoot rotation photographs

Generate the final photographs with the native image-generation tool. The original photo supplies identity, construction, proportions, texture and photographic detail. A reconstructed mesh may supply a textureless or wireframe orientation hint. Do not publish photographs of a rendered mesh, paint textures onto a proxy as the final artwork, or substitute its coarse surface detail for the original.

This follows the user's 2026-10-31 correction: direct mesh renders were rejected for low photographic quality. The 2026-10-30 bag also failed visual rigidity despite centered silhouettes. Preserve both lessons: photographic fidelity and coherent rotation are separate requirements; neither a centered image nor a fixed guide mesh certifies the final AI photographs.

Resolve this checkout from the skill location and follow its current `AGENTS.md`. Read `lib/generation/request.ts`, `lib/client/sample-products.ts`, `docs/image-generation-evaluation.md`, and the current manifests under `design/qa/original-rotation/`. Keep previous selected assets until replacement photographs pass review.

## 1. Prepare the original and orientation guides

Inspect the original with `view_image` and preserve its bytes/SHA-256. Establish the front and source-specific identity details, including relative component sizes and positions. Supporting originals require the user's selection. Never chain generated angles as new identity references.

For a full set, use the existing order: front 0°, front-right three-quarter 45°, right profile 90°, back-right three-quarter 135°, back 180°, back-left three-quarter 225°, left profile 270°, front-left three-quarter 315°. RIGHT is the physical side at screen right in the front photo; positive view angles reveal it first.

Create one approximate source-derived proxy if a suitable mesh is unavailable. Keep reconstruction inputs, method/version, seed, cleanup metadata and mesh hash. Unseen geometry is inferred. A proxy can be useful for direction while still being too crude for final photography; do not let its altered details override the source.

Capture each requested proxy angle with a uniform neutral-gray material and simple diffuse shading, or a clear wireframe if that better communicates orientation. Remove textures, colored materials, decorative backgrounds and distracting cast shadows. Keep one camera, elevation, scale and ground pivot; rotate only the proxy about its center vertical axis. Save the guide images, yaw angles and rig. The guide capture utility and current artifacts are documented in the evaluation reference.

## 2. Generate photographs from the original

Pass exactly the intended inputs explicitly:

1. **Image 1: authoritative original photograph.** Use it for product identity, physical proportions, construction, color, material and fine photographic detail.
2. **Image 2: derived textureless orientation guide.** Use it only to establish the product's direction, visible surfaces and occlusions. It is not another original or a material/texture reference.

Use this instruction before the shared studio prompt:

> Rotate the product in Image 1 so it faces the same direction as Image 2. Rephotograph the original product with its original material detail. Image 2 is an approximate, textureless pose guide only. Do not output, repaint or photograph the proxy mesh. Preserve the original product's proportions and construction where the proxy is coarse or inaccurate.

Use `buildGenerationPrompt(shot, 1)` as the studio/identity base, then explicitly describe Image 2's guide-only role. Passing a reference count of two would incorrectly label the guide as a supporting original. Match the prompt's elevation to the fixed guide camera; do not silently change the application's preset defaults. Add concise source-specific invariants and angle-specific occlusions. For a mug, distinguish a handle swinging toward the camera, appearing edge-on in front, or being hidden behind the body; for a doll, the head, torso, hair and limbs turn together in the original pose.

Keep one square white studio, neutral camera-left key light, gentle fill and soft shadow to screen right. Lock camera distance, elevation, focal length and scale throughout the set. Place the body axis at canvas x = 50%, keep a stable ground anchor, and retain at least 10% product margins. Narrow profiles retain extra white space. Generate one full photographic image per view, with no added labels, props or collage.

Test a three-quarter view and a discriminating profile before expanding the batch. Check original material detail and actual guide orientation. A retained source pose, plastic/sculpted proxy appearance, changed proportions, invented components or wrong handle/face occlusion is a failed candidate. Refine the specific failure using the original plus the same appropriate guide; do not repair it by feeding a rejected photograph into later views. Use the native image tool for raster edits and never invoke the application's paid generation or credit accounting for these illustrative assets.

## 3. Review photographs and register the sequence

Inspect every photograph against the original and the full ordered sequence, including adjacent rear views and the 315-to-0 wrap. Compare component count, pose, body height/width/depth cues, head/handle size, attachment locations, seams, texture scale, perspective, light direction and photographic quality. Foreshortening is expected; changing physical construction or proportions is not. Guide-rig consistency proves the hints are consistent, not that the generated photographs obey them.

Measure body-axis and floor registration separately from geometry/photographic review. The existing sample-specific color thresholds and torso/base/body bands in `scripts/sample-geometry.mjs` are calibrated for these known materials, not arbitrary uploads. Prefer consistent generation framing; use only uniform scale and translation for registration. Never stretch a photograph, recenter around a moving handle/panel seam, force every silhouette midpoint onto the axis, or use per-view zoom to conceal geometry drift. Record offsets and retain 10% product margins.

For accepted replacements, update the existing generation/framing manifests with exact prompts, original and guide roles/paths/hashes, final output hashes, selected generation artifacts and rejected attempts. Preserve historical evidence. Verify source/guide/output provenance and measured framing; report those checks separately from visual coherence. Do not use direct-render mesh/camera checks to certify AI-generated final photographs.

Run the relevant framing check, lint, type check, tests and build. Review the local carousel on desktop and phone before delivery when available. Update authoritative docs and `design-qa.md` with observations and limits.

## 4. Deploy within scope and verify the live rotations

A generation request alone does not authorize publication. When deployment is authorized, follow the repository's commit/push and production-delivery procedure. Require successful checks and verify that the intended live domain is assigned to a READY production deployment for the exact published commit.

Use Brave's Agents profile to inspect the actual live carousel at desktop and phone sizes. For every product, visit all eight views in order, confirm the expected image is fully loaded before each capture, let scrolling settle, and keep the whole product visible below sticky headers. Compare each sequence with its original: material detail, body dimensions, fixed camera/perspective, center vertical axis, floor contact, component attachments, near/far occlusions, adjacent rear views and the last-to-first transition. A dimension jump, camera orbit or changed construction is a failed candidate even when centering metrics pass.

Check autoplay through every product, pause/play, forward and reverse navigation, product boundaries and wraps, original-photo dialogs and browser errors. Retain labeled desktop/phone captures and a review record identifying the live URL, exact commit/deployment, loaded views, observed behavior, photographic/coherence verdict and remaining limits. Use `design/qa/orientation-guided-rotation/live-review.json` and `design-qa.md` as the existing evidence format; keep historical verdicts tied to their reviewed assets and commit.

HTTP image hashes, framing values and deployment READY status verify delivery, not natural rotation or working playback. Do not report the live visual review as passed without inspecting the carousel. If Brave discovery or tab control fails, inspect the available-browser inventory and follow the bundled browser troubleshooting/Brave extension and native-host diagnostics before asking the user to reconnect; an enabled extension can coexist with missing browser discovery. Stay with Brave, preserve browser settings and report the unverified portion honestly. A later explicit deployment instruction may authorize publication while that review remains pending; it does not count as a visual pass.
